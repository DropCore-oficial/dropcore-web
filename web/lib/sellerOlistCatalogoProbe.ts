import type { SupabaseClient } from "@supabase/supabase-js";
import {
  montarIndiceEstoqueOlistCatalogo,
  resolverSaldoIndiceEstoqueOlist,
  type OlistIndiceEstoqueItem,
} from "@/lib/olistTinyApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_SKUS_PROBE = 500;
const AMOSTRA_AUSENTES = 8;

export type SellerOlistCatalogoProbeSummary = {
  total: number;
  encontrados: number;
  ausentes: number;
  amostra_ausentes: string[];
  index_pais: number;
  index_codigos: number;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isSkuIgnoradoProbe(sku: string): boolean {
  const s = str(sku).toUpperCase();
  if (!s || (s.length >= 3 && s.endsWith("000"))) return true;
  const grupoKey = s.length >= 3 ? `${s.slice(0, -3)}000` : s;
  return grupoKey === "DJU999000";
}

export async function loadSellerSkusParaProbeOlist(opts: {
  orgId: string;
  fornecedorId: string;
  supabase?: SupabaseClient;
}): Promise<OlistIndiceEstoqueItem[]> {
  const db = opts.supabase ?? supabaseAdmin;
  const { data: rows, error } = await db
    .from("skus")
    .select("sku, cor, tamanho, status")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .ilike("status", "ativo")
    .order("sku", { ascending: true })
    .limit(MAX_SKUS_PROBE);

  if (error) throw new Error(error.message);

  const out: OlistIndiceEstoqueItem[] = [];
  for (const row of rows ?? []) {
    const sku = str((row as { sku?: string }).sku).toUpperCase();
    if (isSkuIgnoradoProbe(sku)) continue;
    out.push({
      sku,
      cor: str((row as { cor?: string | null }).cor) || null,
      tamanho: str((row as { tamanho?: string | null }).tamanho) || null,
    });
  }
  return out;
}

/** Verifica se SKUs ativos do catálogo existem na Olist deste seller (leitura API). */
export async function probeSellerCatalogoNaOlist(opts: {
  apiToken: string;
  orgId: string;
  fornecedorId: string;
  supabase?: SupabaseClient;
}): Promise<SellerOlistCatalogoProbeSummary> {
  const itens = await loadSellerSkusParaProbeOlist(opts);
  const summary: SellerOlistCatalogoProbeSummary = {
    total: itens.length,
    encontrados: 0,
    ausentes: 0,
    amostra_ausentes: [],
    index_pais: 0,
    index_codigos: 0,
  };

  if (itens.length === 0) return summary;

  const indice = await montarIndiceEstoqueOlistCatalogo(opts.apiToken, {
    itens,
    pauseMs: 180,
  });
  summary.index_pais = indice.paisPorGrupo.size;
  summary.index_codigos = indice.saldoPorCodigo.size;

  for (const item of itens) {
    const ok = resolverSaldoIndiceEstoqueOlist(indice, item);
    if (ok != null) {
      summary.encontrados += 1;
    } else {
      summary.ausentes += 1;
      if (summary.amostra_ausentes.length < AMOSTRA_AUSENTES) {
        summary.amostra_ausentes.push(item.sku);
      }
    }
  }

  return summary;
}

export async function saveSellerOlistCatalogoProbeResult(
  sellerId: string,
  summary: SellerOlistCatalogoProbeSummary,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update({
      olist_last_catalogo_probe_at: now,
      olist_last_catalogo_probe_summary: summary,
    })
    .eq("seller_id", sellerId);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("olist_last_catalogo_probe") || error.code === "42703") return;
    throw new Error(error.message);
  }
}
