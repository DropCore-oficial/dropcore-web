/**
 * Espelha `detalhes_produto_json` do fornecedor → seller (mesma leitura no catálogo).
 */

import {
  aplicarPendingDetalhesEmSkus,
  grupoKeyFromSku,
  mergeDetalhesProdutoJson,
  propagarDetalhesProdutoJsonNoGrupo,
  resolverDetalhesProdutoJson,
} from "@/lib/detalhesProdutoJson";
import { enriquecerDetalhesProdutoLegado } from "@/lib/enriquecerDetalhesProdutoLegado";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SkuCatalogoDetalhesRow = {
  id: string;
  sku: string;
  nome_produto?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  marca?: string | null;
  data_lancamento?: string | null;
  expedicao_override_linha?: string | null;
  status?: string | null;
  detalhes_produto_json?: unknown;
  [key: string]: unknown;
};

/** Mescla alterações pendentes (mesmo critério do GET fornecedor, só bloco detalhes no seller). */
export function mesclarPendingDetalhesCatalogo<T extends SkuCatalogoDetalhesRow>(
  rows: T[],
  pendingBySkuId: Map<string, Record<string, unknown>>
): T[] {
  return aplicarPendingDetalhesEmSkus(rows, pendingBySkuId);
}

/** Inclui SKU pai (…000) no lote para propagar JSON — mesmo se estiver inativo / fora do filtro ativo. */
export async function anexarSkusPaiDoGrupoParaDetalhes(
  supabase: SupabaseClient,
  rows: SkuCatalogoDetalhesRow[],
  opts: { orgId: string; fornecedorId: string; selectFields: string }
): Promise<SkuCatalogoDetalhesRow[]> {
  const grupoKeys = [...new Set(rows.map((r) => grupoKeyFromSku(r.sku)))];
  if (grupoKeys.length === 0) return rows;

  const { data: pais, error } = await supabase
    .from("skus")
    .select(opts.selectFields)
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .in("sku", grupoKeys);

  if (error || !pais?.length) return rows;

  const porId = new Map(rows.map((r) => [r.id, r]));
  for (const p of pais as unknown as SkuCatalogoDetalhesRow[]) {
    if (!porId.has(p.id)) {
      porId.set(p.id, p);
    }
  }
  return [...porId.values()];
}

/** Propaga JSON no grupo + enriquecimento legado (igual fornecedor e seller). */
export function prepararDetalhesProdutoJsonCatalogo<T extends SkuCatalogoDetalhesRow>(rows: T[]): T[] {
  const propagados = propagarDetalhesProdutoJsonNoGrupo(rows);
  return propagados.map((row) => {
    const resolvido = resolverDetalhesProdutoJson(row.detalhes_produto_json);
    const enriquecido = enriquecerDetalhesProdutoLegado(resolvido, {
      nome_produto: String(row.nome_produto ?? ""),
      descricao: row.descricao ?? null,
      categoria: row.categoria ?? null,
      marca: row.marca ?? null,
      data_lancamento: row.data_lancamento ?? null,
      expedicao_override_linha: row.expedicao_override_linha ?? null,
    });
    return { ...row, detalhes_produto_json: enriquecido };
  });
}

export async function carregarPendingDetalhesPorSkuIds(
  supabase: SupabaseClient,
  skuIds: string[],
  orgId: string
): Promise<Map<string, Record<string, unknown>>> {
  const pendingBySkuId = new Map<string, Record<string, unknown>>();
  if (skuIds.length === 0) return pendingBySkuId;

  const { data: pendRows } = await supabase
    .from("sku_alteracoes_pendentes")
    .select("sku_id, dados_propostos")
    .eq("org_id", orgId)
    .eq("status", "pendente")
    .in("sku_id", skuIds);

  for (const row of pendRows ?? []) {
    const sid = row.sku_id as string | undefined;
    const dp = row.dados_propostos;
    if (sid && dp && typeof dp === "object" && !Array.isArray(dp)) {
      pendingBySkuId.set(sid, dp as Record<string, unknown>);
    }
  }
  return pendingBySkuId;
}

/** Pipeline completo: pais do grupo + pending + propagar + enriquecer (espelho fornecedor). */
export async function pipelineDetalhesCatalogoEspelho<T extends SkuCatalogoDetalhesRow>(
  supabase: SupabaseClient,
  rows: T[],
  opts: { orgId: string; fornecedorId: string; selectFields: string }
): Promise<T[]> {
  const comPais = await anexarSkusPaiDoGrupoParaDetalhes(supabase, rows, opts);
  const ids = comPais.map((r) => r.id).filter(Boolean);
  const pendingBySkuId = await carregarPendingDetalhesPorSkuIds(supabase, ids, opts.orgId);
  const comPending = mesclarPendingDetalhesCatalogo(comPais, pendingBySkuId) as T[];
  return prepararDetalhesProdutoJsonCatalogo(comPending);
}

/** Mescla propostos pendentes completos (fornecedor GET). */
export function aplicarPropostosPendentesSku<T extends Record<string, unknown>>(
  sku: T,
  propostos: Record<string, unknown> | null | undefined,
  campos: Set<string>
): T {
  if (!propostos || typeof propostos !== "object") return sku;
  const out = { ...sku } as Record<string, unknown>;
  for (const key of campos) {
    if (!(key in propostos)) continue;
    if (key === "detalhes_produto_json") {
      out[key] = mergeDetalhesProdutoJson(out[key], propostos[key]);
    } else {
      out[key] = propostos[key];
    }
  }
  return out as T;
}
