/**
 * Acesso a produto_tabela_medidas — schema de produção: PK grupo_key, tipo_produto, medidas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TabelaMedidasRow = {
  tipo_produto: string;
  medidas: Record<string, Record<string, number>>;
};

export type TabelaMedidasUpsertContext = {
  org_id?: string;
  fornecedor_id?: string;
};

function paiKey(sku: string): string {
  const s = (sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})(\d{3})$/);
  return m ? `${m[1]}${m[2]}000` : s;
}

function isNullConstraintOnColumn(msg: string, column: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("null value") && lower.includes(column.toLowerCase());
}

/** Confirma que o grupo pertence ao fornecedor (via SKUs do catálogo). */
export async function fornecedorPossuiGrupoSku(
  sb: SupabaseClient,
  orgId: string,
  fornecedorId: string,
  grupoKey: string
): Promise<boolean> {
  const gk = grupoKey.trim().toUpperCase();
  const prefix = gk.length >= 6 ? gk.slice(0, -3) : gk;
  const { data: skus, error } = await sb
    .from("skus")
    .select("sku")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId)
    .ilike("sku", `${prefix}%`)
    .limit(50);
  if (error) throw error;
  return (skus ?? []).some((r) => paiKey(String(r.sku ?? "")) === gk);
}

/** Confirma que o grupo existe no catálogo da org (seller ou fornecedor). */
export async function orgPossuiGrupoSku(
  sb: SupabaseClient,
  orgId: string,
  grupoKey: string
): Promise<{ ok: boolean; fornecedor_id: string | null }> {
  const gk = grupoKey.trim().toUpperCase();
  const { data: pai } = await sb
    .from("skus")
    .select("fornecedor_id")
    .eq("org_id", orgId)
    .eq("sku", gk)
    .maybeSingle();
  if (pai?.fornecedor_id) return { ok: true, fornecedor_id: String(pai.fornecedor_id) };

  const prefix = gk.length >= 6 ? gk.slice(0, -3) : gk;
  const { data: anyRow } = await sb
    .from("skus")
    .select("fornecedor_id")
    .eq("org_id", orgId)
    .ilike("sku", `${prefix}%`)
    .limit(1)
    .maybeSingle();
  if (!anyRow?.fornecedor_id) return { ok: false, fornecedor_id: null };
  return { ok: true, fornecedor_id: String(anyRow.fornecedor_id) };
}

export async function getProdutoTabelaMedidas(
  sb: SupabaseClient,
  grupoKey: string
): Promise<TabelaMedidasRow | null> {
  const gk = grupoKey.trim().toUpperCase();
  const { data, error } = await sb
    .from("produto_tabela_medidas")
    .select("tipo_produto, medidas")
    .eq("grupo_key", gk)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    tipo_produto: data.tipo_produto ?? "generico",
    medidas: (data.medidas as Record<string, Record<string, number>>) ?? {},
  };
}

/** Tabela aprovada do grupo + proposta pendente (se houver), a partir de `sku_alteracoes_pendentes`. */
export async function getTabelaMedidasComPendente(
  sb: SupabaseClient,
  orgId: string,
  fornecedorId: string,
  grupoKey: string
): Promise<{ aprovada: TabelaMedidasRow | null; pendente: TabelaMedidasRow | null }> {
  const gk = grupoKey.trim().toUpperCase();
  const aprovada = await getProdutoTabelaMedidas(sb, gk);

  let pendente: TabelaMedidasRow | null = null;
  const prefix = gk.length >= 6 ? gk.slice(0, -3) : gk;
  const { data: skus } = await sb
    .from("skus")
    .select("id, sku")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId)
    .ilike("sku", `${prefix}%`);
  const skuIds = (skus ?? []).filter((s) => paiKey(String(s.sku ?? "")) === gk).map((s) => s.id);
  if (skuIds.length > 0) {
    const { data: alt } = await sb
      .from("sku_alteracoes_pendentes")
      .select("dados_propostos")
      .eq("fornecedor_id", fornecedorId)
      .eq("org_id", orgId)
      .eq("status", "pendente")
      .in("sku_id", skuIds)
      .limit(1)
      .maybeSingle();
    const dp = alt?.dados_propostos as Record<string, unknown> | null;
    if (dp?.tabela_medidas != null && typeof dp.tabela_medidas === "object") {
      const tm = dp.tabela_medidas as { tipo_produto?: string; medidas?: Record<string, Record<string, number>> };
      pendente = {
        tipo_produto: typeof tm.tipo_produto === "string" ? tm.tipo_produto : "generico",
        medidas: tm.medidas && typeof tm.medidas === "object" ? tm.medidas : {},
      };
    }
  }

  return { aprovada, pendente };
}

export async function upsertProdutoTabelaMedidas(
  sb: SupabaseClient,
  grupoKey: string,
  payload: TabelaMedidasRow,
  ctx?: TabelaMedidasUpsertContext
): Promise<void> {
  const gk = grupoKey.trim().toUpperCase();
  const base = {
    tipo_produto: payload.tipo_produto,
    medidas: payload.medidas,
    atualizado_em: new Date().toISOString(),
  };

  const canonical = { grupo_key: gk, ...base };
  const { error: canonicalErr } = await sb
    .from("produto_tabela_medidas")
    .upsert(canonical, { onConflict: "grupo_key" });
  if (!canonicalErr) return;

  const msg = canonicalErr.message ?? "";

  if (
    ctx?.fornecedor_id &&
    isNullConstraintOnColumn(msg, "fornecedor_id")
  ) {
    const legacy = {
      grupo_key: gk,
      fornecedor_id: ctx.fornecedor_id,
      org_id: ctx.org_id ?? null,
      ...base,
    };
    const { error: legacyErr } = await sb
      .from("produto_tabela_medidas")
      .upsert(legacy, { onConflict: "grupo_key" });
    if (!legacyErr) return;
    throw legacyErr;
  }

  throw canonicalErr;
}

/** Remove tabelas cujo grupo_key corresponde a SKUs do fornecedor. */
export async function deleteProdutoTabelaMedidasForFornecedor(
  sb: SupabaseClient,
  orgId: string,
  fornecedorId: string
): Promise<void> {
  const { data: skus, error: skuErr } = await sb
    .from("skus")
    .select("sku")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (skuErr) throw skuErr;
  const grupoKeys = [
    ...new Set((skus ?? []).map((r) => paiKey(String(r.sku ?? ""))).filter(Boolean)),
  ];
  if (grupoKeys.length === 0) return;
  const { error } = await sb.from("produto_tabela_medidas").delete().in("grupo_key", grupoKeys);
  if (error) throw error;
}
