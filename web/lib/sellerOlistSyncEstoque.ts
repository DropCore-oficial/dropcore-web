import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCatalogSkusForOlistExport } from "@/lib/sellerCatalogOlistLoad";
import { paiKeyFromSku, type CatalogSkuForOlistExport } from "@/lib/sellerCatalogOlistExport";
import {
  definirSaldoEstoqueOlistProduto,
  resolverIdProdutoOlistPorCodigo,
} from "@/lib/olistTinyApi";
import { filtrarFalhasSyncOlist } from "@/lib/sellerOlistSyncCustos";

const API_PAUSE_MS = 220;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

/** Estoque inteiro não negativo para balanço na Olist. */
export function estoqueOlistFromDropCore(estoque_atual: unknown): number {
  if (estoque_atual == null || estoque_atual === "") return 0;
  const n = typeof estoque_atual === "number" ? estoque_atual : parseFloat(String(estoque_atual).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Filhos com estoque; se só pai, inclui pai. */
export function skusParaSyncEstoqueOlist(items: CatalogSkuForOlistExport[]): string[] {
  const filhos = items.filter((i) => !isSkuPaiInterno(str(i.sku)));
  const pool = filhos.length > 0 ? filhos : items;
  return [...new Set(pool.map((i) => str(i.sku).toUpperCase()).filter(Boolean))];
}

export type SyncOlistEstoqueResult = {
  total: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string }>;
  ignorados_ausente_olist: number;
};

async function syncOlistEstoqueSkuCodigo(
  apiToken: string,
  codigo: string,
  saldo: number,
): Promise<{ ok: boolean; ausente?: boolean; erro?: string }> {
  const id = await resolverIdProdutoOlistPorCodigo(apiToken, codigo);
  if (!id) return { ok: false, ausente: true };

  try {
    await definirSaldoEstoqueOlistProduto(apiToken, {
      idProduto: id,
      saldo,
      observacoes: `DropCore estoque ${codigo}`,
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar estoque na Olist.";
    return { ok: false, erro: msg };
  }
}

/** Empurra saldo absoluto (tipo B) para SKUs já cadastrados na Olist deste seller. */
export async function syncOlistEstoqueSkusSeller(opts: {
  apiToken: string;
  orgId: string;
  fornecedorId: string;
  supabase: SupabaseClient;
  skuCodes: string[];
}): Promise<SyncOlistEstoqueResult> {
  const codes = [...new Set(opts.skuCodes.map((s) => str(s).toUpperCase()).filter(Boolean))];
  const result: SyncOlistEstoqueResult = {
    total: codes.length,
    ok: 0,
    falhas: [],
    ignorados_ausente_olist: 0,
  };

  if (codes.length === 0) return result;

  const { data: rows, error } = await opts.supabase
    .from("skus")
    .select("sku, estoque_atual")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .in("sku", codes);

  if (error) {
    result.falhas.push({ sku: codes[0] ?? "?", erro: error.message });
    return result;
  }

  const saldoPorSku = new Map<string, number>();
  for (const row of rows ?? []) {
    const sku = str((row as { sku?: string }).sku).toUpperCase();
    if (!sku) continue;
    saldoPorSku.set(sku, estoqueOlistFromDropCore((row as { estoque_atual?: unknown }).estoque_atual));
  }

  for (let i = 0; i < codes.length; i += 1) {
    const codigo = codes[i]!;
    const saldo = saldoPorSku.get(codigo) ?? 0;
    const r = await syncOlistEstoqueSkuCodigo(opts.apiToken, codigo, saldo);
    if (r.ok) {
      result.ok += 1;
    } else if (r.ausente) {
      result.ignorados_ausente_olist += 1;
    } else {
      result.falhas.push({ sku: codigo, erro: r.erro ?? "Erro ao atualizar estoque na Olist." });
    }
    if (i + 1 < codes.length) await sleep(API_PAUSE_MS);
  }

  result.falhas = filtrarFalhasSyncOlist(result.ok, result.falhas);
  return result;
}

export async function syncOlistEstoqueGrupoSeller(opts: {
  apiToken: string;
  orgId: string;
  sellerId: string;
  fornecedorId: string;
  supabase: SupabaseClient;
  grupoKey: string;
}): Promise<SyncOlistEstoqueResult> {
  const loaded = await loadCatalogSkusForOlistExport({
    orgId: opts.orgId,
    sellerId: opts.sellerId,
    fornecedorId: opts.fornecedorId,
    grupoKey: opts.grupoKey,
    scope: "todos",
    supabase: opts.supabase,
  });

  if (!loaded.ok) {
    return {
      total: 0,
      ok: 0,
      falhas: [{ sku: opts.grupoKey, erro: loaded.error }],
      ignorados_ausente_olist: 0,
    };
  }

  const skuCodes = skusParaSyncEstoqueOlist(loaded.items);
  return syncOlistEstoqueSkusSeller({
    apiToken: opts.apiToken,
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    supabase: opts.supabase,
    skuCodes,
  });
}

export function grupoKeysFromSkuCodes(skuCodes: string[]): string[] {
  const set = new Set<string>();
  for (const sku of skuCodes) {
    const s = str(sku);
    if (!s) continue;
    set.add(paiKeyFromSku(s));
  }
  return [...set];
}
