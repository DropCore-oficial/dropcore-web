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

type LinhaSkuMap = { seller_id: string; sku: string; ml_item_id: string; ml_variation_id: number | null };

function extrairSkusDoItem(item: MercadoLivreItemDetail): Array<{ sku: string; ml_variation_id: number | null }> {
  const encontrados: Array<{ sku: string; ml_variation_id: number | null }> = [];

  const topSku = (item.attributes ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
  if (topSku) encontrados.push({ sku: topSku, ml_variation_id: null });

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

  // Map em vez de array: se o mesmo SKU aparecer 2x (dado inconsistente no ML), o upsert
  // com ON CONFLICT não aceita a mesma linha-alvo duas vezes no mesmo comando — o Map já
  // resolve isso (última ocorrência vence) antes de chegar no banco.
  const porSku = new Map<string, LinhaSkuMap>();
  for (const item of itens) {
    for (const { sku, ml_variation_id } of extrairSkusDoItem(item)) {
      porSku.set(sku, { seller_id: sellerId, sku, ml_item_id: item.id, ml_variation_id });
    }
  }

  const linhas = Array.from(porSku.values());
  if (linhas.length > 0) {
    const { error } = await supabaseAdmin
      .from("seller_mercadolivre_sku_map")
      .upsert(
        linhas.map((l) => ({ ...l, atualizado_em: new Date().toISOString() })),
        { onConflict: "seller_id,sku" }
      );
    if (error) throw new Error(error.message);
  }

  return { conectado: true, itens_escaneados: itens.length, skus_encontrados: linhas.length };
}
