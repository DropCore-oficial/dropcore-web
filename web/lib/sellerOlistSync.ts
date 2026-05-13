import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";
import { shouldImportSituacaoText } from "@/lib/olistPedidoImportPolicy";
import { pesquisarPedidosOlist, type OlistPedidoResumo } from "@/lib/olistTinyApi";
import { processOlistPedidoImport } from "@/lib/sellerOlistPedidoImport";
import { decryptSellerErpSecret, describeSellerErpSecretDecryptFailure } from "@/lib/sellerErpSecretBox";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SYNC_OVERLAP_MS = 2 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_SELLER = 25;
const OLIST_API_PAUSE_MS = 200;

export type SellerOlistSyncRow = {
  seller_id: string;
  org_id: string;
  olist_token_ciphertext: string | null;
  olist_pedidos_sync_cursor_at: string | null;
  olist_token_validated_at: string | null;
  updated_at: string | null;
};

export type SellerOlistSyncSellerResult = {
  seller_id: string;
  org_id: string;
  status: "ok" | "parcial" | "erro" | "ignorado";
  imported: number;
  skipped: number;
  errors: string[];
  warnings: string[];
};

export type SellerOlistSyncRunResult = {
  started_at: string;
  finished_at: string;
  sellers_total: number;
  sellers: SellerOlistSyncSellerResult[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSyncFrom(row: SellerOlistSyncRow, now: Date): Date {
  const cursor = row.olist_pedidos_sync_cursor_at ? new Date(row.olist_pedidos_sync_cursor_at) : null;
  if (cursor && !Number.isNaN(cursor.getTime())) {
    return new Date(cursor.getTime() - SYNC_OVERLAP_MS);
  }

  const validated = row.olist_token_validated_at ? new Date(row.olist_token_validated_at) : null;
  if (validated && !Number.isNaN(validated.getTime())) {
    return validated;
  }

  const updated = row.updated_at ? new Date(row.updated_at) : null;
  if (updated && !Number.isNaN(updated.getTime())) {
    return updated;
  }

  return new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
}

async function listSellerOlistIntegrations(): Promise<SellerOlistSyncRow[]> {
  const { data, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select(
      "seller_id, org_id, olist_token_ciphertext, olist_pedidos_sync_cursor_at, olist_token_validated_at, updated_at"
    )
    .not("olist_token_ciphertext", "is", null);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("olist_pedidos_sync_cursor_at") || error.code === "42703") {
      const fallback = await supabaseAdmin
        .from("seller_olist_integrations")
        .select("seller_id, org_id, olist_token_ciphertext, olist_token_validated_at, updated_at")
        .not("olist_token_ciphertext", "is", null);
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) => ({
        ...(row as SellerOlistSyncRow),
        olist_pedidos_sync_cursor_at: null,
      }));
    }
    throw new Error(error.message);
  }

  return (data ?? []) as SellerOlistSyncRow[];
}

async function persistSellerSyncState(params: {
  seller_id: string;
  cursor_at: string;
  status: "ok" | "parcial" | "erro";
  error: string | null;
  summary: Record<string, unknown>;
}) {
  const payload: Record<string, unknown> = {
    olist_pedidos_sync_cursor_at: params.cursor_at,
    olist_last_sync_at: new Date().toISOString(),
    olist_last_sync_status: params.status,
    olist_last_sync_error: params.error,
    olist_last_sync_summary: params.summary,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update(payload)
    .eq("seller_id", params.seller_id);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("olist_last_sync") || error.code === "42703") {
      await supabaseAdmin
        .from("seller_olist_integrations")
        .update({ updated_at: new Date().toISOString() })
        .eq("seller_id", params.seller_id);
      return;
    }
    console.error("[olist-sync] persist state:", error.message);
  }
}

async function collectPedidosAtualizados(
  token: string,
  from: Date,
  maxOrders: number
): Promise<OlistPedidoResumo[]> {
  const byId = new Map<number, OlistPedidoResumo>();
  let pagina = 1;
  let numeroPaginas = 1;

  while (pagina <= numeroPaginas && byId.size < maxOrders) {
    const page = await pesquisarPedidosOlist(token, { dataAtualizacao: from, pagina });
    numeroPaginas = page.numero_paginas;
    for (const pedido of page.pedidos) {
      byId.set(pedido.id, pedido);
      if (byId.size >= maxOrders) break;
    }
    pagina += 1;
    if (pagina <= numeroPaginas && byId.size < maxOrders) {
      await sleep(OLIST_API_PAUSE_MS);
    }
  }

  return [...byId.values()];
}

async function syncSellerOlistOrders(row: SellerOlistSyncRow, now: Date): Promise<SellerOlistSyncSellerResult> {
  const result: SellerOlistSyncSellerResult = {
    seller_id: row.seller_id,
    org_id: row.org_id,
    status: "ok",
    imported: 0,
    skipped: 0,
    errors: [],
    warnings: [],
  };

  if (!row.olist_token_ciphertext) {
    result.status = "ignorado";
    result.warnings.push("Integração sem token salvo.");
    return result;
  }

  let token: string;
  try {
    token = decryptSellerErpSecret(row.olist_token_ciphertext);
  } catch (error: unknown) {
    result.status = "erro";
    result.errors.push(describeSellerErpSecretDecryptFailure(error));
    await persistSellerSyncState({
      seller_id: row.seller_id,
      cursor_at: row.olist_pedidos_sync_cursor_at ?? now.toISOString(),
      status: "erro",
      error: result.errors[0] ?? "token_invalido",
      summary: result,
    });
    return result;
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", row.seller_id)
    .eq("org_id", row.org_id)
    .maybeSingle();

  if (sellerErr || !sellerRow) {
    result.status = "erro";
    result.errors.push("Seller não encontrado para a integração Olist/Tiny.");
    await persistSellerSyncState({
      seller_id: row.seller_id,
      cursor_at: row.olist_pedidos_sync_cursor_at ?? now.toISOString(),
      status: "erro",
      error: result.errors[0] ?? "seller_nao_encontrado",
      summary: result,
    });
    return result;
  }

  const syncFrom = resolveSyncFrom(row, now);
  let pedidosResumo: OlistPedidoResumo[] = [];

  try {
    pedidosResumo = await collectPedidosAtualizados(token, syncFrom, MAX_ORDERS_PER_SELLER);
  } catch (e: unknown) {
    result.status = "erro";
    result.errors.push(e instanceof Error ? e.message : "Erro ao pesquisar pedidos na Olist/Tiny.");
    await persistSellerSyncState({
      seller_id: row.seller_id,
      cursor_at: row.olist_pedidos_sync_cursor_at ?? now.toISOString(),
      status: "erro",
      error: result.errors[0] ?? "pesquisa_falhou",
      summary: result,
    });
    return result;
  }

  if (pedidosResumo.length === 0) {
    result.warnings.push("Nenhum pedido atualizado na Olist/Tiny nesta consulta.");
  }

  for (const resumo of pedidosResumo) {
    if (!shouldImportSituacaoText(resumo.situacao)) {
      result.skipped += 1;
      continue;
    }

    const proc = await processOlistPedidoImport({
      org_id: row.org_id,
      seller_id: row.seller_id,
      olist_token_ciphertext: row.olist_token_ciphertext,
      olist_pedido_id: resumo.id,
    });

    if (!proc.ok) {
      result.status = "parcial";
      result.errors.push(`Pedido ${resumo.id}: ${proc.error}`);
      continue;
    }

    if (proc.outcome === "skipped_duplicate" || proc.outcome === "skipped_situacao") {
      result.skipped += 1;
      continue;
    }

    if (proc.outcome === "skipped_sem_itens") {
      result.skipped += 1;
      result.warnings.push(...proc.warnings);
      continue;
    }

    if (proc.outcome === "imported") {
      if (proc.warnings.length > 0) {
        result.status = "parcial";
        result.warnings.push(...proc.warnings);
      }
      result.imported += 1;
    }
  }

  await persistSellerSyncState({
    seller_id: row.seller_id,
    cursor_at: now.toISOString(),
    status: result.status === "ok" ? "ok" : result.status === "ignorado" ? "ok" : result.status,
    error: result.errors[0] ?? null,
    summary: result,
  });

  return result;
}

async function loadSellerOlistIntegrationRow(sellerId: string): Promise<SellerOlistSyncRow | null> {
  const { data, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select(
      "seller_id, org_id, olist_token_ciphertext, olist_pedidos_sync_cursor_at, olist_token_validated_at, updated_at"
    )
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("olist_pedidos_sync_cursor_at") || error.code === "42703") {
      const fallback = await supabaseAdmin
        .from("seller_olist_integrations")
        .select("seller_id, org_id, olist_token_ciphertext, olist_token_validated_at, updated_at")
        .eq("seller_id", sellerId)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      return {
        ...(fallback.data as SellerOlistSyncRow),
        olist_pedidos_sync_cursor_at: null,
      };
    }
    throw new Error(error.message);
  }

  return (data as SellerOlistSyncRow | null) ?? null;
}

export async function runSellerOlistSyncForSellerId(
  sellerId: string
): Promise<SellerOlistSyncSellerResult | null> {
  const row = await loadSellerOlistIntegrationRow(sellerId);
  if (!row?.olist_token_ciphertext?.trim()) return null;
  return syncSellerOlistOrders(row, new Date());
}

export async function runSellerOlistSync(): Promise<SellerOlistSyncRunResult> {
  const started = new Date();
  const rows = await listSellerOlistIntegrations();
  const sellers: SellerOlistSyncSellerResult[] = [];

  for (const row of rows) {
    sellers.push(await syncSellerOlistOrders(row, started));
  }

  return {
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    sellers_total: sellers.length,
    sellers,
  };
}
