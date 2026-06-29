import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncOlistEstoqueFornecedorSkus } from "@/lib/sellerOlistSyncEstoqueOnChange";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function parseSaldo(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

/** Resolve SKU DropCore a partir do payload Olist (estoque). */
export function skuFromOlistEstoqueWebhookDados(dados: Record<string, unknown> | null | undefined): string {
  if (!dados) return "";
  const candidates = [dados.sku, dados.skuMapeamento, dados.codigo].map((v) => str(v).toUpperCase());
  for (const c of candidates) {
    if (c) return c;
  }
  return "";
}

export type AplicarEstoqueWebhookResult = {
  ok: boolean;
  updated: boolean;
  pushed_sellers: number;
  reason?: string;
};

/** Aplica saldo vindo do webhook (sem chamar API Olist). */
export async function aplicarEstoqueWebhookFornecedor(opts: {
  fornecedorId: string;
  orgId: string;
  skuCode: string;
  saldo: number;
}): Promise<AplicarEstoqueWebhookResult> {
  const sku = str(opts.skuCode).toUpperCase();
  const saldo = parseSaldo(opts.saldo);
  if (!sku || saldo == null) {
    return { ok: false, updated: false, pushed_sellers: 0, reason: "sku_ou_saldo_invalido" };
  }
  if (isSkuPaiInterno(sku)) {
    return { ok: true, updated: false, pushed_sellers: 0, reason: "sku_pai_ignorado" };
  }

  const { data: row, error } = await supabaseAdmin
    .from("skus")
    .select("id, estoque_atual")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .eq("sku", sku)
    .maybeSingle();

  if (error) {
    return { ok: false, updated: false, pushed_sellers: 0, reason: error.message };
  }
  if (!row?.id) {
    return { ok: true, updated: false, pushed_sellers: 0, reason: "sku_desconhecido_dropcore" };
  }

  const atualRaw = (row as { estoque_atual?: number | null }).estoque_atual;
  const atual = atualRaw == null ? null : Math.max(0, Math.floor(Number(atualRaw)));

  if (atual === saldo) {
    await touchFornecedorWebhookEstoqueLastAt(opts.fornecedorId);
    return { ok: true, updated: false, pushed_sellers: 0, reason: "sem_mudanca" };
  }

  const { error: upErr } = await supabaseAdmin
    .from("skus")
    .update({ estoque_atual: saldo })
    .eq("id", row.id)
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (upErr) {
    return { ok: false, updated: false, pushed_sellers: 0, reason: upErr.message };
  }

  const push = await syncOlistEstoqueFornecedorSkus({
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    skuCodes: [sku],
    skipFornecedorPush: true,
  });

  await touchFornecedorWebhookEstoqueLastAt(opts.fornecedorId);

  return { ok: true, updated: true, pushed_sellers: push.sellers };
}

async function touchFornecedorWebhookEstoqueLastAt(fornecedorId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .update({
      olist_webhook_estoque_last_at: now,
      olist_last_estoque_sync_at: now,
      olist_last_estoque_sync_status: "webhook",
      olist_last_estoque_sync_error: null,
      updated_at: now,
    })
    .eq("fornecedor_id", fornecedorId);
}

export async function logFornecedorOlistWebhookEstoque(params: {
  fornecedor_id: string | null;
  org_id: string | null;
  olist_cnpj_normalized: string | null;
  sku: string | null;
  saldo: number | null;
  payload: Record<string, unknown>;
  resultado: string;
  error_detail: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("fornecedor_olist_webhook_logs").insert({
    fornecedor_id: params.fornecedor_id,
    org_id: params.org_id,
    olist_cnpj_normalized: params.olist_cnpj_normalized,
    sku: params.sku,
    saldo: params.saldo,
    payload: params.payload,
    resultado: params.resultado,
    error_detail: params.error_detail,
  });
  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (!msg.includes("fornecedor_olist_webhook_logs") && error.code !== "42P01") {
      console.error("[fornecedorOlistWebhookEstoque] log:", error.message);
    }
  }
}
