/**
 * POST /api/webhooks/mercadolivre — recebe as "Notificações" do Mercado Livre
 * (topic + resource, sem dado completo) e ingere o pedido pelo mesmo pipeline real de
 * produção (`submitSellerErpPedido`), igual ao fluxo Olist.
 *
 * Segurança: o payload do ML não vem assinado — nunca confiar em dado do corpo além de
 * `user_id`/`resource`/`topic`. Sempre buscar o pedido de novo na API com o token que a
 * gente já guarda pro `ml_user_id` conhecido; se o `ml_user_id` não bater com nenhum
 * seller conectado, ignora silenciosamente (não é erro, é notificação de conta alheia).
 *
 * Exclusivo com Olist (ver guards em /api/seller/olist e /api/seller/mercadolivre/oauth):
 * se por algum motivo o seller tiver os dois conectados, ignora aqui também — dobrar o
 * pedido (uma vez via Olist, uma via ML direto) debitaria estoque/saldo em dobro.
 *
 * Sempre responde 200 rápido (mesmo em erro interno, já logado) — não deixar o ML
 * reenviar/backoff por um erro nosso que retry não resolve (ex.: SKU sem seller_sku).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MlNotification = {
  resource?: string;
  user_id?: number | string;
  topic?: string;
};

type MlOrderDetalhe = {
  order_items?: Array<{
    item?: { seller_sku?: string | null };
    quantity?: number;
  }>;
  buyer?: { nickname?: string | null };
  total_amount?: number;
  paid_amount?: number;
};

async function fetchOrder(orderId: string, accessToken: string): Promise<MlOrderDetalhe | null> {
  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as MlOrderDetalhe;
}

async function processarNotificacao(body: MlNotification): Promise<void> {
  // "shipments" (mudança de status de envio) fica de fora por ora — a previsão de
  // liberação de etiqueta já é buscada sob demanda (ver pedidoEtiquetaMercadoLivreBuffer.ts)
  // quando a tela de pedidos carrega, não precisa de handler dedicado aqui ainda.
  if (body.topic !== "orders_v2" && body.topic !== "orders") return;

  const orderId = String(body.resource ?? "").match(/\/orders\/(\d+)/)?.[1];
  if (!orderId || body.user_id == null) return;

  const { data: integracao } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("seller_id")
    .eq("ml_user_id", String(body.user_id))
    .maybeSingle();
  if (!integracao?.seller_id) return;

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", integracao.seller_id)
    .maybeSingle();
  if (!sellerRow?.fornecedor_id) return;

  const { data: olistRow } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("seller_id", sellerRow.id)
    .maybeSingle();
  if (olistRow?.olist_token_ciphertext) {
    console.warn(
      `[webhooks/mercadolivre] seller ${sellerRow.id} tem Olist ativo — ignorando pedido ${orderId} pra não duplicar.`
    );
    return;
  }

  const ctx = await getValidMercadoLivreAccessToken(sellerRow.id);
  if (!ctx) return;

  const order = await fetchOrder(orderId, ctx.accessToken);
  if (!order) return;

  const items = (order.order_items ?? [])
    .map((oi) => ({ sku: oi.item?.seller_sku ?? null, quantidade: Number(oi.quantity ?? 1) }))
    .filter((it): it is { sku: string; quantidade: number } => !!it.sku);

  if (items.length === 0) {
    console.error(
      `[webhooks/mercadolivre] pedido ${orderId} (seller ${sellerRow.id}) sem seller_sku em nenhum item — não dá pra mapear pro catálogo DropCore.`
    );
    return;
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
    referencia_externa: `ml:${orderId}`,
    items,
    meta: {
      marketplace_numero: orderId,
      comprador_nome: order.buyer?.nickname ?? null,
      canal_venda: "mercado_livre",
      preco_venda: Number(order.total_amount ?? order.paid_amount ?? 0) || null,
    },
  });

  if (!result.ok && result.error_code !== "PEDIDO_DUPLICADO") {
    console.error(`[webhooks/mercadolivre] pedido ${orderId} falhou:`, result.error_code, result.error_message);
  }
}

export async function POST(req: Request) {
  let body: MlNotification;
  try {
    body = (await req.json()) as MlNotification;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await processarNotificacao(body);
  } catch (e: unknown) {
    console.error("[webhooks/mercadolivre]", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
