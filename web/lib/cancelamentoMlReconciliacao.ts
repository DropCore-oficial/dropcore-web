/**
 * Reconciliação de cancelamento no Mercado Livre sem sync (achado 2026-10-09). O ML pode
 * cancelar uma venda (ex.: nota fiscal nunca emitida → etiqueta nunca liberada) e isso nunca
 * chega ao DropCore: o pedido fica travado em "enviado" e o financial_ledger continua
 * BLOQUEADO pra sempre. Dois pontos chamam este arquivo:
 * - webhook do ML (tópico orders_v2), tempo real;
 * - etiquetaMlRetry.ts, como rede de segurança a cada tentativa sem etiqueta.
 *
 * Nunca decide com base no payload do webhook — sempre rebusca o status real na API do ML
 * com o token do seller antes de cancelar/estornar nada (mesmo racional já usado pro
 * reprocessamento da Amanda no mesmo webhook).
 */
import { getValidMercadoLivreAccessToken, mlBuscarStatusPedido } from "@/lib/mercadoLivreApiClient";
import { cancelarPedidoEEstornar } from "@/lib/pedidoCancelarEstorno";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PedidoParaConferir = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string | null;
};

async function buscarPedidoMlPendente(
  sellerId: string,
  marketplaceNumero: string
): Promise<PedidoParaConferir | null> {
  const { data } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, fornecedor_id")
    .eq("seller_id", sellerId)
    .eq("marketplace_numero", marketplaceNumero)
    .eq("canal_venda", "mercado_livre")
    .eq("status", "enviado")
    .eq("e_teste", false)
    .maybeSingle();
  return data ?? null;
}

/**
 * Confirma no ML que o pedido foi cancelado e, se sim, aciona a RPC que cancela o pedido e
 * estorna o saldo bloqueado do seller. Idempotente — pode ser chamado mais de uma vez (webhook
 * e cron podem concorrer) sem efeito duplicado, a RPC confere o status antes de agir.
 */
export async function reconciliarCancelamentoPedidoMl(
  sellerId: string,
  marketplaceNumero: string
): Promise<{ cancelado: boolean }> {
  try {
    const pedido = await buscarPedidoMlPendente(sellerId, marketplaceNumero);
    if (!pedido) return { cancelado: false };

    const ctx = await getValidMercadoLivreAccessToken(sellerId);
    if (!ctx) return { cancelado: false };

    const statusReal = await mlBuscarStatusPedido(marketplaceNumero, ctx);
    if (statusReal?.status !== "cancelled") return { cancelado: false };

    const resultado = await cancelarPedidoEEstornar({
      pedido_id: pedido.id,
      org_id: pedido.org_id,
      canal_label: "Mercado Livre",
      motivo_tecnico: "ml_sem_sync",
      motivo_seller:
        "O Mercado Livre cancelou este pedido (etiqueta de envio nunca liberada — confira se a nota fiscal foi emitida a tempo).",
    });

    return { cancelado: resultado.cancelado };
  } catch (e) {
    console.error("[cancelamentoMlReconciliacao] erro:", e);
    return { cancelado: false };
  }
}
