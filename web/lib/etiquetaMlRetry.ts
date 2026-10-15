import { reconciliarCancelamentoPedidoMl } from "@/lib/cancelamentoMlReconciliacao";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { getValidMercadoLivreAccessToken, mlBuscarEtiquetaPdf, mlBuscarStatusPedido } from "@/lib/mercadoLivreApiClient";
import { notifyAdminsEtiquetaMlFalha } from "@/lib/notifyAdminsEtiquetaMlFalha";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { calcularPrazoDespachoPedido } from "@/lib/pedidoSlaDespacho";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 2;
const MAX_PEDIDOS_PER_RUN = 100;
const MAX_TENTATIVAS_ANTES_ALERTA = 20;
const HORAS_ANTES_ALERTA = 24;
/** Mesmo racional do retry da Olist: dá algumas rodadas antes de já sair alertando um
 * pedido que nasceu "antigo" (ex.: backlog). */
const MIN_TENTATIVAS_PARA_ALERTA_POR_IDADE = 3;
/** Acima disso, para de tentar automaticamente — o seller já foi alertado bem antes
 * (MAX_TENTATIVAS_ANTES_ALERTA=20). Histórico real (pedido do seller Vinz Collection,
 * 2026-10-15): com teto de 50 o cron esgotava o orçamento em ~12h30 (50 × 15 min) e parava
 * de checar pra sempre — mas o ML só liberou a etiqueta 3 dias depois, e ninguém mais
 * verificava. 500 ≈ 5 dias de cobertura no mesmo ritmo de 15 em 15 min antes de desistir de
 * verdade (fila não pode ficar travada indefinidamente num pedido que o ML nunca libera —
 * ver mesmo problema já visto no retry da Olist). */
const MAX_TENTATIVAS_AUTO_RETRY = 500;
/** A partir do primeiro alerta, continua lembrando nesse intervalo enquanto o pedido
 * seguir sem etiqueta — mesmo padrão do retry da Olist. */
const HORAS_ENTRE_LEMBRETES = 6;

export type EtiquetaMlRetrySummary = {
  avaliados: number;
  obtidas: number;
  pendentes: number;
  alertas_enviados: number;
  falhas: number;
  cancelados_ml: number;
};

type PedidoPendenteEtiquetaMl = {
  id: string;
  org_id: string;
  seller_id: string;
  referencia_externa: string | null;
  marketplace_numero: string | null;
  criado_em: string;
  etiqueta_tentativas: number | null;
  etiqueta_alerta_enviado_em: string | null;
};

/**
 * Retry dedicado pra buscar a etiqueta real de envio (Mercado Livre) até conseguir. O
 * webhook de pedido novo (`/api/webhooks/mercadolivre`) não avisa quando a etiqueta libera
 * — o tópico `shipments` é ignorado de propósito — e a tela de Pedidos só busca a
 * *previsão* de liberação (`pedidoEtiquetaMercadoLivreBuffer.ts`), não a etiqueta em si.
 * Sem este cron, a etiqueta real nunca é buscada de novo depois da ingestão do pedido.
 */
export async function runEtiquetaMlRetry(): Promise<EtiquetaMlRetrySummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, org_id, seller_id, referencia_externa, marketplace_numero, criado_em, etiqueta_tentativas, etiqueta_alerta_enviado_em"
    )
    .eq("status", "enviado")
    .eq("canal_venda", "mercado_livre")
    .eq("e_teste", false)
    .is("etiqueta_pdf_url", null)
    .is("etiqueta_pdf_base64", null)
    .like("referencia_externa", "ml:%")
    .lt("etiqueta_tentativas", MAX_TENTATIVAS_AUTO_RETRY)
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoPendenteEtiquetaMl[]>();

  if (error) {
    console.error("[etiquetaMlRetry] listar:", error.message);
    return { avaliados: 0, obtidas: 0, pendentes: 0, alertas_enviados: 0, falhas: 0, cancelados_ml: 0 };
  }

  const pedidos = (rows ?? []).filter((p): p is PedidoPendenteEtiquetaMl & { marketplace_numero: string } =>
    Boolean(p.marketplace_numero)
  );
  let obtidas = 0;
  let pendentes = 0;
  let alertasEnviados = 0;
  let falhas = 0;
  let canceladosMl = 0;

  /** Token é por seller — cacheia dentro da rodada pra não pedir de novo a cada pedido do
   * mesmo seller. */
  const tokensPorSeller = new Map<string, Awaited<ReturnType<typeof getValidMercadoLivreAccessToken>>>();

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    let ctx = tokensPorSeller.get(pedido.seller_id);
    if (ctx === undefined) {
      ctx = await getValidMercadoLivreAccessToken(pedido.seller_id);
      tokensPorSeller.set(pedido.seller_id, ctx);
    }
    if (!ctx) {
      falhas += 1;
      return;
    }

    const pdfBase64 = await mlBuscarEtiquetaPdf(ctx, pedido.marketplace_numero);

    // SLA de despacho (Fase 2) — a data que o ML prevê já pode mudar até a véspera do
    // despacho (buffer de transportadora), então refaz a cada rodada enquanto o pedido
    // seguir sem etiqueta; best-effort, nunca derruba o retry principal da etiqueta.
    try {
      const prazo = await calcularPrazoDespachoPedido({
        canalVenda: "mercado_livre",
        etiquetaImpressaEm: null,
        sellerId: pedido.seller_id,
        marketplaceNumero: pedido.marketplace_numero,
      });
      if (prazo) {
        await supabaseAdmin.from("pedidos").update({ sla_prazo_despacho: prazo.toISOString() }).eq("id", pedido.id);
      }
    } catch (e: unknown) {
      console.error("[etiquetaMlRetry] sla_prazo_despacho:", pedido.id, e);
    }

    if (pdfBase64) {
      const { error: updateErr } = await supabaseAdmin
        .from("pedidos")
        .update({
          etiqueta_pdf_base64: pdfBase64,
          etiqueta_liberada_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id)
        .eq("org_id", pedido.org_id);
      if (updateErr) {
        console.error("[etiquetaMlRetry] update:", pedido.id, updateErr.message);
        falhas += 1;
        return;
      }
      obtidas += 1;
      return;
    }

    // Rede de segurança (achado 2026-10-09): antes de só contar mais uma tentativa sem
    // etiqueta, confere se o ML já cancelou a venda de verdade (ex.: nota fiscal nunca
    // emitida) — sem isso o pedido ficaria travado em "enviado" pra sempre, sem estornar o
    // saldo bloqueado do seller. Ver cancelamentoMlReconciliacao.ts.
    const statusReal = await mlBuscarStatusPedido(pedido.marketplace_numero, ctx);
    if (statusReal?.status === "cancelled") {
      const { cancelado } = await reconciliarCancelamentoPedidoMl(pedido.seller_id, pedido.marketplace_numero);
      if (cancelado) {
        canceladosMl += 1;
        return;
      }
    }

    pendentes += 1;
    const novasTentativas = (pedido.etiqueta_tentativas ?? 0) + 1;
    const criadoHaMuito = Date.now() - new Date(pedido.criado_em).getTime() > HORAS_ANTES_ALERTA * 3_600_000;
    const ultimoAlertaMs = pedido.etiqueta_alerta_enviado_em ? new Date(pedido.etiqueta_alerta_enviado_em).getTime() : null;
    const podeLembrarDeNovo = !ultimoAlertaMs || Date.now() - ultimoAlertaMs > HORAS_ENTRE_LEMBRETES * 3_600_000;
    const deveAlertar =
      podeLembrarDeNovo &&
      (novasTentativas >= MAX_TENTATIVAS_ANTES_ALERTA ||
        (criadoHaMuito && novasTentativas >= MIN_TENTATIVAS_PARA_ALERTA_POR_IDADE));
    const agora = new Date().toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("pedidos")
      .update({
        etiqueta_tentativas: novasTentativas,
        etiqueta_ultima_tentativa_em: agora,
        ...(deveAlertar ? { etiqueta_alerta_enviado_em: agora } : {}),
      })
      .eq("id", pedido.id);
    if (updateErr) {
      console.error("[etiquetaMlRetry] update tentativas:", pedido.id, updateErr.message);
    }

    if (deveAlertar) {
      await notifyAdminsEtiquetaMlFalha({ org_id: pedido.org_id, pedido_id: pedido.id });
      await notifySellerPedidoAtencao({
        org_id: pedido.org_id,
        seller_id: pedido.seller_id,
        pedido_id: pedido.id,
        tipo: "etiqueta_pendente_manual",
        motivo: `A etiqueta real de envio (Mercado Livre) não foi encontrada automaticamente depois de ${novasTentativas} tentativas. Pode estar no buffer de liberação do próprio ML — confira em Pedidos.`,
      });
      alertasEnviados += 1;
    }
  });

  return {
    avaliados: pedidos.length,
    obtidas,
    pendentes,
    alertas_enviados: alertasEnviados,
    falhas,
    cancelados_ml: canceladosMl,
  };
}
