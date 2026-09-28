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
  mlBuscarItensDetalheComAtributosVariacao,
  type MercadoLivreItemDetail,
} from "@/lib/mercadoLivreApiClient";

export type ItemSemSku = { ml_item_id: string; titulo: string; permalink: string | null };

export type SincronizarSkuResultado = {
  conectado: boolean;
  itens_escaneados: number;
  skus_encontrados: number;
  /** Anúncios ativos escaneados que não tinham SELLER_SKU em nenhuma variação — causa raiz
   * recorrente de pedido preso e de os Gestores de IA não terem dado suficiente pra rodar
   * (ver notifySellerAnunciosSemSkuCatalogo.ts). */
  itens_sem_sku: ItemSemSku[];
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
    // SELLER_SKU de variação mora em `attributes` (atributos "extras"), não em
    // `attribute_combinations` (só os que definem a combinação, ex. cor/tamanho) — checa
    // os dois arrays por segurança, já que `attribute_combinations` às vezes também
    // carrega isso em contas mais antigas.
    const vSku =
      (v.attributes ?? []).find((a) => a.id === "SELLER_SKU")?.value_name ??
      (v.attribute_combinations ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
    if (vSku) encontrados.push({ sku: vSku, ml_variation_id: v.id });
  }
  return encontrados;
}

export async function sincronizarSkuMercadoLivre(sellerId: string): Promise<SincronizarSkuResultado> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return { conectado: false, itens_escaneados: 0, skus_encontrados: 0, itens_sem_sku: [] };

  const ids = await mlBuscarTodosItensAtivos(ctx);
  const itens = await mlBuscarItensDetalheComAtributosVariacao(ids, ctx);

  // Chave por anúncio+variação, não por SKU — o mesmo SKU pode estar em vários anúncios
  // (seller republica anúncio do mesmo produto, é normal). Map só pra evitar mandar a
  // mesma linha-alvo 2x no mesmo upsert (ON CONFLICT não aceita isso).
  const porItemVariacao = new Map<string, LinhaSkuMap>();
  const itensSemSku: ItemSemSku[] = [];
  for (const item of itens) {
    const skusDoItem = extrairSkusDoItem(item);
    if (skusDoItem.length === 0) {
      itensSemSku.push({ ml_item_id: item.id, titulo: item.title, permalink: item.permalink ?? null });
      continue;
    }
    for (const { sku, ml_variation_id } of skusDoItem) {
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

  return { conectado: true, itens_escaneados: itens.length, skus_encontrados: linhas.length, itens_sem_sku: itensSemSku };
}
