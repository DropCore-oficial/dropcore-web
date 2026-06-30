import type { SupabaseClient } from "@supabase/supabase-js";
import { saveFornecedorOlistEstoqueSyncResult, type FornecedorOlistEstoqueSyncSummary } from "@/lib/fornecedorOlistIntegration";
import {
  montarIndiceEstoqueOlistCatalogo,
  resolverSaldoIndiceEstoqueOlist,
} from "@/lib/olistTinyApi";
import { syncOlistEstoqueFornecedorSkus } from "@/lib/sellerOlistSyncEstoqueOnChange";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const API_PAUSE_MS = 220;
const MAX_SKUS_PER_RUN = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

function isSkuIgnoradoPullEstoque(sku: string): boolean {
  const s = str(sku).toUpperCase();
  if (!s || isSkuPaiInterno(s)) return true;
  const grupoKey = s.length >= 3 ? `${s.slice(0, -3)}000` : s;
  if (grupoKey === "DJU999000") return true;
  return false;
}

export type PullFornecedorEstoqueOlistResult = FornecedorOlistEstoqueSyncSummary & {
  status: "ok" | "parcial" | "erro";
  error: string | null;
};

type PullSkuRow = {
  id: string;
  sku: string;
  estoque_atual: number | null;
  cor: string | null;
  tamanho: string | null;
};

/** Pull estoque da Olist do fornecedor → skus no DropCore → push para sellers ligados. */
export async function pullFornecedorEstoqueFromOlist(opts: {
  fornecedorId: string;
  orgId: string;
  apiToken: string;
  supabase?: SupabaseClient;
}): Promise<PullFornecedorEstoqueOlistResult> {
  const db = opts.supabase ?? supabaseAdmin;
  const summary: FornecedorOlistEstoqueSyncSummary = {
    total: 0,
    updated: 0,
    unchanged: 0,
    missing_olist: 0,
    errors: 0,
    pushed_sellers: 0,
  };

  const { data: rows, error } = await db
    .from("skus")
    .select("id, sku, estoque_atual, cor, tamanho")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .eq("status", "ativo")
    .order("sku", { ascending: true })
    .limit(MAX_SKUS_PER_RUN);

  if (error) {
    const result: PullFornecedorEstoqueOlistResult = {
      ...summary,
      status: "erro",
      error: error.message,
    };
    await saveFornecedorOlistEstoqueSyncResult(opts.fornecedorId, {
      status: "erro",
      error: error.message,
      summary,
    });
    return result;
  }

  const changedSkuCodes: string[] = [];
  const pullRows: PullSkuRow[] = [];
  for (const row of rows ?? []) {
    const sku = str((row as { sku?: string }).sku).toUpperCase();
    if (isSkuIgnoradoPullEstoque(sku)) continue;
    pullRows.push({
      id: str((row as { id?: string }).id),
      sku,
      estoque_atual:
        (row as { estoque_atual?: number | null }).estoque_atual == null
          ? null
          : Math.max(0, Math.floor(Number((row as { estoque_atual?: number | null }).estoque_atual))),
      cor: str((row as { cor?: string | null }).cor) || null,
      tamanho: str((row as { tamanho?: string | null }).tamanho) || null,
    });
  }

  let indice;
  try {
    indice = await montarIndiceEstoqueOlistCatalogo(opts.apiToken, {
      skusAlvo: pullRows.map((r) => r.sku),
      pauseMs: API_PAUSE_MS,
    });
  } catch {
    const result: PullFornecedorEstoqueOlistResult = {
      ...summary,
      status: "erro",
      error: "Falha ao listar catálogo na Olist.",
    };
    await saveFornecedorOlistEstoqueSyncResult(opts.fornecedorId, {
      status: "erro",
      error: result.error,
      summary,
    });
    return result;
  }

  for (const row of pullRows) {
    summary.total += 1;

    let saldoOlist: number | null;
    try {
      saldoOlist = resolverSaldoIndiceEstoqueOlist(indice, row);
    } catch {
      summary.errors += 1;
      await sleep(API_PAUSE_MS);
      continue;
    }

    if (saldoOlist == null) {
      summary.missing_olist += 1;
      continue;
    }

    const atual = row.estoque_atual;

    if (atual === saldoOlist) {
      summary.unchanged += 1;
      continue;
    }

    const { error: upErr } = await db
      .from("skus")
      .update({ estoque_atual: saldoOlist })
      .eq("id", row.id)
      .eq("org_id", opts.orgId)
      .eq("fornecedor_id", opts.fornecedorId);

    if (upErr) {
      summary.errors += 1;
    } else {
      summary.updated += 1;
      changedSkuCodes.push(row.sku);
    }
  }

  if (changedSkuCodes.length > 0) {
    const push = await syncOlistEstoqueFornecedorSkus({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      skuCodes: changedSkuCodes,
      skipFornecedorPush: true,
    });
    summary.pushed_sellers = push.sellers;
  }

  const status: PullFornecedorEstoqueOlistResult["status"] =
    summary.errors > 0 && summary.updated === 0
      ? "erro"
      : summary.errors > 0
        ? "parcial"
        : "ok";

  const result: PullFornecedorEstoqueOlistResult = {
    ...summary,
    status,
    error:
      status === "erro"
        ? "Falha ao consultar estoque na Olist."
        : status === "parcial"
          ? `${summary.errors} SKU(s) com erro de API na Olist.`
          : null,
  };

  await saveFornecedorOlistEstoqueSyncResult(opts.fornecedorId, {
    status,
    error: result.error,
    summary: {
      ...summary,
      index_codigos: indice.saldoPorCodigo.size,
      index_pais: indice.paisPorGrupo.size,
    },
  });

  return result;
}

/** Cron: pull de estoque para todos os fornecedores com token Olist. */
export async function runFornecedorOlistEstoquePullTodos(): Promise<{
  fornecedores: number;
  ok: number;
  parcial: number;
  erro: number;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .select("fornecedor_id, org_id, olist_token_ciphertext")
    .not("olist_token_ciphertext", "is", null);

  if (error) throw new Error(error.message);

  let ok = 0;
  let parcial = 0;
  let erro = 0;

  for (const row of rows ?? []) {
    const fornecedorId = str((row as { fornecedor_id?: string }).fornecedor_id);
    const orgId = str((row as { org_id?: string }).org_id);
    const cipher = str((row as { olist_token_ciphertext?: string }).olist_token_ciphertext);
    if (!fornecedorId || !orgId || !cipher) continue;

    const { getFornecedorOlistApiToken } = await import("@/lib/fornecedorOlistIntegration");
    const apiToken = await getFornecedorOlistApiToken(fornecedorId);
    if (!apiToken) {
      erro += 1;
      continue;
    }

    try {
      const r = await pullFornecedorEstoqueFromOlist({ fornecedorId, orgId, apiToken });
      if (r.status === "ok") ok += 1;
      else if (r.status === "parcial") parcial += 1;
      else erro += 1;
    } catch {
      erro += 1;
    }
  }

  return { fornecedores: rows?.length ?? 0, ok, parcial, erro };
}
