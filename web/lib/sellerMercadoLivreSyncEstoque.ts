/**
 * Sync direto de estoque fornecedor→Mercado Livre — escreve direto na API do ML usando o
 * vínculo SKU↔anúncio já populado em seller_mercadolivre_sku_map (mercadoLivreSkuSync.ts).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlAtualizarEstoque,
  type MercadoLivreEstoqueAtualizacao,
} from "@/lib/mercadoLivreApiClient";
import { estoqueDisponivelParaVenda, aplicarEstoqueSegurancaMl } from "@/lib/skuGrupoEstoqueCalculo";
import { sincronizarSkuMercadoLivre } from "@/lib/ai/mercadoLivreSkuSync";
import { registrarMlSyncFalha } from "@/lib/mlSyncFalhas";
import { registrarMlSyncLog } from "@/lib/mlSyncLog";

const API_PAUSE_MS = 220;

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

  // Sempre tenta re-sincronizar o mapa quando algum SKU some dele — antes isso só rodava
  // se o mapa inteiro "parecesse velho" (>10min sem nenhuma linha tocada), o que numa conta
  // de alto volume quase nunca acontece (outra venda qualquer sempre refresca o relógio) e
  // mascarava um SKU específico faltando indefinidamente. Achado real 2026-11-24: foi
  // exatamente isso que deixou o seller Felipão vender um pedido do SKU DJU003031 já sem
  // estoque — o push nunca chegou a tentar re-mapear esse SKU porque o mapa "parecia" OK.
  if (codesFaltando.length > 0) {
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

  const saldoEnviadoPorSku = new Map<string, number>();
  const porItem = new Map<string, MercadoLivreEstoqueAtualizacao[]>();
  for (const row of mapRows) {
    const sku = String((row as { sku: string }).sku).toUpperCase();
    const saldoReal = saldoPorSku.get(sku);
    if (saldoReal == null) continue;
    const saldo = aplicarEstoqueSegurancaMl(saldoReal);
    saldoEnviadoPorSku.set(sku, saldo);
    const itemId = String((row as { ml_item_id: string }).ml_item_id);
    const variationId = Number((row as { ml_variation_id: number }).ml_variation_id ?? 0);
    const lista = porItem.get(itemId) ?? [];
    lista.push({ variationId, availableQuantity: saldo });
    porItem.set(itemId, lista);
  }

  const skusPorItem = new Map<string, string[]>();
  for (const row of mapRows) {
    const itemId = String((row as { ml_item_id: string }).ml_item_id);
    const sku = String((row as { sku: string }).sku);
    const lista = skusPorItem.get(itemId) ?? [];
    lista.push(sku);
    skusPorItem.set(itemId, lista);
  }

  const result: SyncMercadoLivreEstoqueResult = { conectado: true, itens_atualizados: 0, falhas: [] };
  const itens = [...porItem.entries()];
  for (let i = 0; i < itens.length; i++) {
    const [itemId, atualizacoes] = itens[i]!;
    const r = await mlAtualizarEstoque(itemId, atualizacoes, ctx);
    const skusDoItem = skusPorItem.get(itemId) ?? [];
    if (r.ok) {
      result.itens_atualizados += 1;
    } else {
      result.falhas.push({ ml_item_id: itemId, erro: r.erro });
      await registrarMlSyncFalha({
        orgId: opts.orgId,
        sellerId: opts.sellerId,
        fornecedorId: opts.fornecedorId,
        tipo: "estoque_push",
        sku: skusDoItem[0] ?? null,
        mlItemId: itemId,
        erro: r.erro,
      });
    }
    for (const sku of skusDoItem) {
      await registrarMlSyncLog({
        orgId: opts.orgId,
        sellerId: opts.sellerId,
        fornecedorId: opts.fornecedorId,
        sku,
        mlItemId: itemId,
        estoqueEnviado: saldoEnviadoPorSku.get(sku.toUpperCase()) ?? null,
        sucesso: r.ok,
        erro: r.ok ? null : r.erro,
      });
    }
    if (i + 1 < itens.length) await sleep(API_PAUSE_MS);
  }

  return result;
}
