/**
 * POST /api/webhooks/mercadolivre — recebe as "Notificações" do Mercado Livre
 * (topic + resource, sem dado completo) e ingere o pedido pelo mesmo pipeline real de
 * produção (`submitSellerErpPedido`), igual ao fluxo Olist. Lógica de ingestão em
 * lib/mercadoLivrePedidoIngest.ts — compartilhada com o cron de reconciliação
 * (/api/cron/ml-pedidos-reconciliacao), que é a rede de segurança pro que esse webhook
 * perder (notificação que nunca chega, instabilidade prolongada, deploy no meio, etc. —
 * mesma lição já aprendida com o webhook da Olist, que não é confiável sozinho).
 *
 * Segurança: o payload do ML não vem assinado — nunca confiar em dado do corpo além de
 * `user_id`/`resource`/`topic`. Sempre buscar o pedido de novo na API com o token que a
 * gente já guarda pro `ml_user_id` conhecido; se o `ml_user_id` não bater com nenhum
 * seller conectado, ignora silenciosamente (não é erro, é notificação de conta alheia).
 *
 * Resposta: 200 quando processou (sucesso, duplicado, ou falha que repetir não resolve —
 * ex. SKU sem seller_sku); 500 só quando a falha é claramente passageira (API do ML
 * instável, token não renovou), pra acionar o retry nativo do ML.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingerirPedidoMercadoLivrePorSeller } from "@/lib/mercadoLivrePedidoIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MlNotification = {
  resource?: string;
  user_id?: number | string;
  topic?: string;
};

export async function POST(req: Request) {
  let body: MlNotification;
  try {
    body = (await req.json()) as MlNotification;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // "shipments" (mudança de status de envio) fica de fora por ora — a previsão de
  // liberação de etiqueta já é buscada sob demanda (ver pedidoEtiquetaMercadoLivreBuffer.ts).
  if (body.topic !== "orders_v2" && body.topic !== "orders") return NextResponse.json({ ok: true });

  const orderId = String(body.resource ?? "").match(/\/orders\/(\d+)/)?.[1];
  if (!orderId || body.user_id == null) return NextResponse.json({ ok: true });

  try {
    const { data: integracao } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id")
      .eq("ml_user_id", String(body.user_id))
      .maybeSingle();
    if (!integracao?.seller_id) return NextResponse.json({ ok: true });

    const resultado = await ingerirPedidoMercadoLivrePorSeller({ sellerId: integracao.seller_id, orderId });

    if (!resultado.ok) {
      console.error(`[webhooks/mercadolivre] pedido ${orderId}:`, resultado.motivo);
      if (resultado.retryable) {
        return NextResponse.json({ ok: false, error: resultado.motivo }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[webhooks/mercadolivre]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
