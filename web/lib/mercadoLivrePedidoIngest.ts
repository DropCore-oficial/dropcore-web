/**
 * Núcleo compartilhado de ingestão de um pedido do Mercado Livre pro DropCore — usado
 * pelo webhook (tempo real) e pelo cron de reconciliação (rede de segurança, pega o que
 * o webhook perder). Mesma lógica nos dois, pra não divergir.
 *
 * Exclusivo com Olist: se o seller tiver os dois conectados, ignora (ver guards em
 * /api/seller/olist e /api/seller/mercadolivre/oauth — aqui é a segunda camada de defesa).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";

type MlOrderDetalhe = {
  order_items?: Array<{
    item?: { seller_sku?: string | null };
    quantity?: number;
  }>;
  buyer?: { nickname?: string | null };
  total_amount?: number;
  paid_amount?: number;
};

export type IngerirPedidoMlResultado =
  | { ok: true; status: "novo" | "duplicado" | "bloqueado" | "pendente_estoque" | "ignorado_olist_ativo" }
  | { ok: false; retryable: boolean; motivo: string };

async function fetchOrder(
  orderId: string,
  accessToken: string
): Promise<{ ok: true; order: MlOrderDetalhe } | { ok: false; retryable: boolean; status: number }> {
  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.ok) return { ok: true, order: (await res.json()) as MlOrderDetalhe };
  // 404/403 = pedido não existe ou sem permissão pra esse token — repetir não muda nada.
  // Qualquer outro status (429, 5xx, etc.) é instabilidade da API do ML — vale repetir.
  const retryable = res.status !== 404 && res.status !== 403;
  return { ok: false, retryable, status: res.status };
}

export async function ingerirPedidoMercadoLivrePorSeller(params: {
  sellerId: string;
  orderId: string;
}): Promise<IngerirPedidoMlResultado> {
  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", params.sellerId)
    .maybeSingle();
  if (sellerErr) return { ok: false, retryable: true, motivo: `Falha ao buscar seller: ${sellerErr.message}` };
  if (!sellerRow?.fornecedor_id) return { ok: false, retryable: false, motivo: "Seller sem fornecedor vinculado." };

  const { data: olistRow } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("seller_id", sellerRow.id)
    .maybeSingle();
  if (olistRow?.olist_token_ciphertext) {
    console.warn(
      `[mercadoLivrePedidoIngest] seller ${sellerRow.id} tem Olist ativo — ignorando pedido ${params.orderId} pra não duplicar.`
    );
    return { ok: true, status: "ignorado_olist_ativo" };
  }

  const ctx = await getValidMercadoLivreAccessToken(sellerRow.id);
  if (!ctx) return { ok: false, retryable: true, motivo: "Sem token válido do Mercado Livre." };

  const orderRes = await fetchOrder(params.orderId, ctx.accessToken);
  if (!orderRes.ok) {
    return {
      ok: false,
      retryable: orderRes.retryable,
      motivo: `Falha ao buscar pedido ${params.orderId} na API do ML (status ${orderRes.status}).`,
    };
  }

  const items = (orderRes.order.order_items ?? [])
    .map((oi) => ({ sku: oi.item?.seller_sku ?? null, quantidade: Number(oi.quantity ?? 1) }))
    .filter((it): it is { sku: string; quantidade: number } => !!it.sku);

  if (items.length === 0) {
    return {
      ok: false,
      retryable: false,
      motivo: `Pedido ${params.orderId} sem seller_sku em nenhum item — não dá pra mapear pro catálogo DropCore.`,
    };
  }

  const result = await submitSellerErpPedido({
    org_id: sellerRow.org_id,
    seller: {
      id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      plano: sellerRow.plano,
      erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
      erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
    },
    referencia_externa: `ml:${params.orderId}`,
    items,
    meta: {
      marketplace_numero: params.orderId,
      comprador_nome: orderRes.order.buyer?.nickname ?? null,
      canal_venda: "mercado_livre",
      preco_venda: Number(orderRes.order.total_amount ?? orderRes.order.paid_amount ?? 0) || null,
    },
  });

  if (result.ok) {
    const status = result.status === "bloqueado" ? "bloqueado" : result.status === "pendente_estoque" ? "pendente_estoque" : "novo";
    return { ok: true, status };
  }
  if (result.error_code === "PEDIDO_DUPLICADO") return { ok: true, status: "duplicado" };

  // INTERNAL_ERROR pode ser hiccup passageiro de banco — vale repetir. O resto (SKU
  // inexistente, valor inválido, etc.) é problema de dado que não muda tentando de novo.
  return { ok: false, retryable: result.error_code === "INTERNAL_ERROR", motivo: result.error_message };
}
