/**
 * Sync DIRETO de estoque fornecedor→Mercado Livre — complementa o sync via Olist/Tiny
 * (sellerOlistSyncEstoque.ts): aquele depende da própria Olist propagar pro ML no tempo
 * dela (ou nem propagar, se o seller não tiver ERP conectado); este escreve direto na API
 * do ML usando o vínculo SKU↔anúncio já populado em seller_mercadolivre_sku_map
 * (mercadoLivreSkuSync.ts). Mesmo saldo (estoqueDisponivelParaVenda) dos dois caminhos.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlAtualizarEstoque,
  type MercadoLivreEstoqueAtualizacao,
} from "@/lib/mercadoLivreApiClient";
import { estoqueDisponivelParaVenda } from "@/lib/sellerOlistSyncEstoque";
import { sincronizarSkuMercadoLivre } from "@/lib/ai/mercadoLivreSkuSync";

const API_PAUSE_MS = 220;

/** O cron `gestores-ia-sync-sku-ml` só roda 1x/dia — sem isso, um seller que acabou de
 * conectar o ML (ou publicou um anúncio novo hoje) fica até 24h com a baixa de estoque
 * passando em branco (SKU não encontrado no mapa, sem erro visível). Reconsulta o vínculo
 * na hora quando falta algum SKU, mas só se o mapa desse seller estiver "velho" (ou nunca
 * tiver rodado) — evita bater na API do ML a cada venda pra SKU que genuinamente não está
 * anunciado lá. */
const RESYNC_MAPA_MIN_INTERVALO_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LinhaMapaSku = { sku: string; ml_item_id: string; ml_variation_id: number };

async function buscarMapaSku(sellerId: string, codes: string[]): Promise<LinhaMapaSku[]> {
  const { data } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku, ml_item_id, ml_variation_id")
    .eq("seller_id", sellerId)
    .in("sku", codes);
  return (data ?? []) as LinhaMapaSku[];
}

async function mapaPrecisaResync(sellerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("atualizado_em")
    .eq("seller_id", sellerId)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.atualizado_em) return true;
  return Date.now() - new Date(data.atualizado_em).getTime() > RESYNC_MAPA_MIN_INTERVALO_MS;
}

export type SyncMercadoLivreEstoqueResult = {
  conectado: boolean;
  itens_atualizados: number;
  falhas: Array<{ ml_item_id: string; erro: string }>;
};

const VAZIO: SyncMercadoLivreEstoqueResult = { conectado: false, itens_atualizados: 0, falhas: [] };

/** Empurra o saldo disponível pros anúncios do ML vinculados a esses SKUs (seller atual).
 * Silenciosamente não faz nada se o seller não tiver ML conectado ou nenhum SKU mapeado —
 * não é erro, é o caso normal de seller que só vende por outro canal. */
export async function syncMercadoLivreEstoqueSkusSeller(opts: {
  sellerId: string;
  orgId: string;
  fornecedorId: string;
  skuCodes: string[];
  /** Saldo já calculado por quem chama (evita reconsultar `skus`) — chave = SKU em upper-case. */
  saldoOverrides?: Map<string, number>;
}): Promise<SyncMercadoLivreEstoqueResult> {
  const codes = [...new Set(opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (codes.length === 0) return VAZIO;

  const ctx = await getValidMercadoLivreAccessToken(opts.sellerId);
  if (!ctx) return VAZIO;

  let mapRows = await buscarMapaSku(opts.sellerId, codes);
  const codesMapeados = new Set(mapRows.map((r) => r.sku.toUpperCase()));
  const codesFaltando = codes.filter((c) => !codesMapeados.has(c));

  if (codesFaltando.length > 0 && (await mapaPrecisaResync(opts.sellerId))) {
    try {
      await sincronizarSkuMercadoLivre(opts.sellerId);
      mapRows = await buscarMapaSku(opts.sellerId, codes);
    } catch (e: unknown) {
      console.error("[syncMercadoLivreEstoqueSkusSeller] resync sku map", opts.sellerId, e);
    }
  }

  if (mapRows.length === 0) return { conectado: true, itens_atualizados: 0, falhas: [] };

  const saldoPorSku = new Map(opts.saldoOverrides ?? []);
  const faltando = codes.filter((c) => !saldoPorSku.has(c));
  if (faltando.length > 0) {
    const { data: skuRows } = await supabaseAdmin
      .from("skus")
      .select("sku, estoque_atual, estoque_reservado")
      .eq("org_id", opts.orgId)
      .eq("fornecedor_id", opts.fornecedorId)
      .in("sku", faltando);
    for (const row of skuRows ?? []) {
      const sku = String((row as { sku?: string }).sku ?? "").toUpperCase();
      if (!sku) continue;
      saldoPorSku.set(
        sku,
        estoqueDisponivelParaVenda(
          (row as { estoque_atual?: unknown }).estoque_atual,
          (row as { estoque_reservado?: unknown }).estoque_reservado
        )
      );
    }
  }

  const porItem = new Map<string, MercadoLivreEstoqueAtualizacao[]>();
  for (const row of mapRows) {
    const sku = String((row as { sku: string }).sku).toUpperCase();
    const saldo = saldoPorSku.get(sku);
    if (saldo == null) continue;
    const itemId = String((row as { ml_item_id: string }).ml_item_id);
    const variationId = Number((row as { ml_variation_id: number }).ml_variation_id ?? 0);
    const lista = porItem.get(itemId) ?? [];
    lista.push({ variationId, availableQuantity: saldo });
    porItem.set(itemId, lista);
  }

  const result: SyncMercadoLivreEstoqueResult = { conectado: true, itens_atualizados: 0, falhas: [] };
  const itens = [...porItem.entries()];
  for (let i = 0; i < itens.length; i++) {
    const [itemId, atualizacoes] = itens[i]!;
    const r = await mlAtualizarEstoque(itemId, atualizacoes, ctx);
    if (r.ok) result.itens_atualizados += 1;
    else result.falhas.push({ ml_item_id: itemId, erro: r.erro });
    if (i + 1 < itens.length) await sleep(API_PAUSE_MS);
  }

  return result;
}
