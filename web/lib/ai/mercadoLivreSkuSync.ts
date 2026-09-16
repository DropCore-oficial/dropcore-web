/**
 * Sync do vínculo SKU (DropCore) ↔ anúncio do Mercado Livre — popula
 * seller_mercadolivre_sku_map lendo o atributo "SELLER_SKU" de cada anúncio ativo do
 * seller (testado ao vivo: 92 de 100 anúncios amostrados já tinham isso preenchido).
 * Não usa IA, é só leitura da API do ML + upsert — zero custo de token.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarTodosItensAtivos,
  mlBuscarItensDetalhe,
  type MercadoLivreItemDetail,
} from "@/lib/mercadoLivreApiClient";

export type SincronizarSkuResultado = {
  conectado: boolean;
  itens_escaneados: number;
  skus_encontrados: number;
};

type LinhaSkuMap = { seller_id: string; sku: string; ml_item_id: string; ml_variation_id: number };

/** `0` = sem variação (SKU no nível do anúncio, não por variação) — nunca `null`, porque
 * duas linhas com `ml_variation_id` null não conflitam entre si no Postgres (o upsert
 * criaria linha nova a cada sync em vez de atualizar a existente). */
function extrairSkusDoItem(item: MercadoLivreItemDetail): Array<{ sku: string; ml_variation_id: number }> {
  const encontrados: Array<{ sku: string; ml_variation_id: number }> = [];

  const topSku = (item.attributes ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
  if (topSku) encontrados.push({ sku: topSku, ml_variation_id: 0 });

  for (const v of item.variations ?? []) {
    const vSku = (v.attribute_combinations ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
    if (vSku) encontrados.push({ sku: vSku, ml_variation_id: v.id });
  }
  return encontrados;
}

export async function sincronizarSkuMercadoLivre(sellerId: string): Promise<SincronizarSkuResultado> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return { conectado: false, itens_escaneados: 0, skus_encontrados: 0 };

  const ids = await mlBuscarTodosItensAtivos(ctx);
  const itens = await mlBuscarItensDetalhe(ids, ctx);

  // Chave por anúncio+variação, não por SKU — o mesmo SKU pode estar em vários anúncios
  // (seller republica anúncio do mesmo produto, é normal). Map só pra evitar mandar a
  // mesma linha-alvo 2x no mesmo upsert (ON CONFLICT não aceita isso).
  const porItemVariacao = new Map<string, LinhaSkuMap>();
  for (const item of itens) {
    for (const { sku, ml_variation_id } of extrairSkusDoItem(item)) {
      porItemVariacao.set(`${item.id}:${ml_variation_id}`, { seller_id: sellerId, sku, ml_item_id: item.id, ml_variation_id });
    }
  }

  const linhas = Array.from(porItemVariacao.values());
  if (linhas.length > 0) {
    const { error } = await supabaseAdmin
      .from("seller_mercadolivre_sku_map")
      .upsert(
        linhas.map((l) => ({ ...l, atualizado_em: new Date().toISOString() })),
        { onConflict: "seller_id,ml_item_id,ml_variation_id" }
      );
    if (error) throw new Error(error.message);
  }

  return { conectado: true, itens_escaneados: itens.length, skus_encontrados: linhas.length };
}
