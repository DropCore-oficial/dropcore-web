import type { SupabaseClient } from "@supabase/supabase-js";
import { paiKeyFromSku } from "@/lib/sellerCatalogOlistExport";
import { loadCatalogSkusForOlistExport } from "@/lib/sellerCatalogOlistLoad";
import { syncOlistCustosGrupo, type SyncOlistCustosResult } from "@/lib/sellerOlistSyncCustos";

const GRUPO_PAUSE_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isGrupoOculto(sku: string): boolean {
  const key = sku.length >= 3 ? sku.slice(0, -3) + "000" : sku;
  return key === "DJU999000";
}

function isSementeSku(sku: string, nome: string): boolean {
  if (sku === "DJU999000") return true;
  return nome.toLowerCase().includes("semente");
}

/** Lista grupos (SKU pai) ativos do armazém do seller. */
export async function listGrupoKeysCatalogoSeller(opts: {
  orgId: string;
  fornecedorId: string;
  supabase: SupabaseClient;
}): Promise<string[]> {
  const { data: rows, error } = await opts.supabase
    .from("skus")
    .select("sku, nome_produto")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .ilike("status", "ativo")
    .order("sku", { ascending: true })
    .limit(600);

  if (error) throw new Error("Erro ao listar grupos do catálogo.");

  const set = new Set<string>();
  for (const row of rows ?? []) {
    const sku = str((row as { sku?: string }).sku);
    const nome = str((row as { nome_produto?: string }).nome_produto);
    if (!sku || isSementeSku(sku, nome) || isGrupoOculto(sku)) continue;
    set.add(paiKeyFromSku(sku));
  }
  return [...set].sort();
}

export type SyncOlistPrecosCatalogoResult = {
  grupos: number;
  grupos_ok: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string; grupo?: string }>;
  ignorados_sem_custo: number;
  por_grupo: Array<{ grupo: string; ok: number; falhas: number; modo?: string }>;
};

export async function syncOlistPrecosCatalogoSeller(opts: {
  apiToken: string;
  orgId: string;
  sellerId: string;
  fornecedorId: string;
  supabase: SupabaseClient;
  scope?: "habilitados" | "todos";
  margemPct?: number;
  grupoKeys?: string[];
}): Promise<SyncOlistPrecosCatalogoResult> {
  const scope = opts.scope === "habilitados" ? "habilitados" : "todos";
  const margemPct = opts.margemPct ?? 0;
  const grupoKeys =
    opts.grupoKeys?.length && opts.grupoKeys.length > 0
      ? opts.grupoKeys.map((g) => g.trim().toUpperCase()).filter(Boolean)
      : await listGrupoKeysCatalogoSeller({
          orgId: opts.orgId,
          fornecedorId: opts.fornecedorId,
          supabase: opts.supabase,
        });

  const result: SyncOlistPrecosCatalogoResult = {
    grupos: grupoKeys.length,
    grupos_ok: 0,
    ok: 0,
    falhas: [],
    ignorados_sem_custo: 0,
    por_grupo: [],
  };

  for (let i = 0; i < grupoKeys.length; i += 1) {
    const grupoKey = grupoKeys[i]!;
    const loaded = await loadCatalogSkusForOlistExport({
      orgId: opts.orgId,
      sellerId: opts.sellerId,
      fornecedorId: opts.fornecedorId,
      grupoKey,
      scope,
      supabase: opts.supabase,
    });

    if (!loaded.ok) {
      result.falhas.push({ sku: grupoKey, erro: loaded.error, grupo: grupoKey });
      result.por_grupo.push({ grupo: grupoKey, ok: 0, falhas: 1 });
      continue;
    }

    const sync: SyncOlistCustosResult = await syncOlistCustosGrupo(opts.apiToken, loaded.items, { margemPct });
    result.ok += sync.ok;
    result.ignorados_sem_custo += sync.ignorados_sem_custo;
    result.falhas.push(...sync.falhas.map((f) => ({ ...f, grupo: grupoKey })));
    if (sync.ok > 0) result.grupos_ok += 1;
    result.por_grupo.push({
      grupo: grupoKey,
      ok: sync.ok,
      falhas: sync.falhas.length,
      modo: sync.modo,
    });

    if (i + 1 < grupoKeys.length) await sleep(GRUPO_PAUSE_MS);
  }

  return result;
}
