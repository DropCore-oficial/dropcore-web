/**
 * Resolução compartilhada "claim do ML → pedido interno + fornecedor" — extraído de
 * `gestorDisputasFornecedorDados.ts` (Amanda) pra ser reusado também pela detecção de
 * devolução (`mlDevolucaoDeteccao.ts`), que precisa do mesmo cruzamento mas roda
 * independente do add-on de Gestores de IA. Comportamento idêntico ao que já existia.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  mlBuscarPedidoItemPrincipal,
  type MercadoLivreAuthContext,
  type MercadoLivreReclamacao,
  type MercadoLivrePedidoItemML,
} from "@/lib/mercadoLivreApiClient";

export type PedidoVinculoReclamacao = { id: string; fornecedor_id: string | null; ledger_id: string | null };

/** Acha o fornecedor via `seller_mercadolivre_sku_map` (item_id → sku → skus.fornecedor_id)
 * — funciona mesmo pra seller sem nenhum pedido ML sincronizado em `pedidos` (ingestão de
 * pedido direto do ML é outro projeto, ainda não construído; isso aqui não cria pedido nem
 * mexe em financial_ledger, só descobre "quem fabricou/despachou esse item"). */
export async function buscarFornecedorViaSkuMap(sellerId: string, mlItemId: string): Promise<string | null> {
  const { data: vinculo } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku")
    .eq("seller_id", sellerId)
    .eq("ml_item_id", mlItemId)
    .maybeSingle();
  if (!vinculo?.sku) return null;

  const { data: skuRow } = await supabaseAdmin
    .from("skus")
    .select("fornecedor_id")
    .eq("sku", vinculo.sku)
    .maybeSingle();
  return skuRow?.fornecedor_id ?? null;
}

/** Casa uma reclamação do ML com o pedido interno (via `pedidos.marketplace_numero`) e
 * resolve o fornecedor por trás dela — direto pelo pedido quando existe, ou por fallback
 * via vínculo SKU↔ML quando não há pedido ML sincronizado. */
export async function resolverPedidoEFornecedorPorReclamacao(
  sellerId: string,
  reclamacao: MercadoLivreReclamacao,
  ctx: MercadoLivreAuthContext
): Promise<{ pedido: PedidoVinculoReclamacao | null; itemPedido: MercadoLivrePedidoItemML | null; fornecedorId: string | null }> {
  const [pedidoRes, itemPedido] = await Promise.all([
    supabaseAdmin
      .from("pedidos")
      .select("id, fornecedor_id, ledger_id")
      .eq("seller_id", sellerId)
      .eq("marketplace_numero", reclamacao.resourceId)
      .maybeSingle<PedidoVinculoReclamacao>(),
    // Busca o item_id direto do pedido no ML (não depende do vínculo pedidos↔marketplace_numero
    // acima) — é o que alimenta o link "Ver anúncio" mesmo quando não achamos o pedido interno.
    mlBuscarPedidoItemPrincipal(reclamacao.resourceId, ctx).catch(() => null),
  ]);
  const pedido = pedidoRes.data;
  // pedidos.fornecedor_id só existe pra seller com pedido ML de verdade sincronizado
  // (não é o caso hoje — ingestão direta do ML ainda não existe). Fallback: descobre o
  // fornecedor pelo vínculo SKU↔ML que já existe, sem precisar de pedido nenhum.
  const fornecedorId =
    pedido?.fornecedor_id ?? (itemPedido ? await buscarFornecedorViaSkuMap(sellerId, itemPedido.itemId) : null);

  return { pedido: pedido ?? null, itemPedido, fornecedorId };
}
