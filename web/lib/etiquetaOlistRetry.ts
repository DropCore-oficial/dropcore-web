import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { notifyAdminsEtiquetaOlistFalha } from "@/lib/notifyAdminsEtiquetaOlistFalha";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { tryAttachOlistEtiquetaPdf } from "@/lib/sellerOlistPedidoImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 2;
const MAX_PEDIDOS_PER_RUN = 100;
const MAX_TENTATIVAS_ANTES_ALERTA = 20;
const HORAS_ANTES_ALERTA = 24;
/** Evita alertar já na 1ª tentativa pra pedido que já nasceu "antigo" (ex.: backlog) — dá algumas rodadas de retry primeiro. */
const MIN_TENTATIVAS_PARA_ALERTA_POR_IDADE = 3;

export type EtiquetaOlistRetrySummary = {
  avaliados: number;
  obtidas: number;
  pendentes: number;
  alertas_enviados: number;
  falhas: number;
};

type PedidoPendenteEtiqueta = {
  id: string;
  org_id: string;
  seller_id: string;
  referencia_externa: string | null;
  criado_em: string;
  etiqueta_tentativas: number | null;
  etiqueta_alerta_enviado_em: string | null;
};

function extrairOlistPedidoId(referenciaExterna: string | null): number | null {
  if (!referenciaExterna?.startsWith("olist:")) return null;
  const n = Number(referenciaExterna.slice("olist:".length));
  return Number.isFinite(n) ? n : null;
}

/**
 * Retry dedicado pra buscar a etiqueta real de envio (Olist) até conseguir.
 * A tentativa original (web/lib/sellerOlistPedidoImport.ts) só roda uma vez, no
 * momento da importação/promoção do pedido — se a Olist ainda não tiver gerado a
 * expedição nesse instante, a etiqueta nunca mais é buscada sem este cron.
 */
export async function runEtiquetaOlistRetry(): Promise<EtiquetaOlistRetrySummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, referencia_externa, criado_em, etiqueta_tentativas, etiqueta_alerta_enviado_em")
    .in("status", ["enviado", "aguardando_repasse"])
    .is("etiqueta_pdf_url", null)
    .is("etiqueta_pdf_base64", null)
    .like("referencia_externa", "olist:%")
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoPendenteEtiqueta[]>();

  if (error) {
    console.error("[etiquetaOlistRetry] listar:", error.message);
    return { avaliados: 0, obtidas: 0, pendentes: 0, alertas_enviados: 0, falhas: 0 };
  }

  const pedidos = rows ?? [];
  let obtidas = 0;
  let pendentes = 0;
  let alertasEnviados = 0;
  let falhas = 0;

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    const olistPedidoId = extrairOlistPedidoId(pedido.referencia_externa);
    if (olistPedidoId == null) {
      falhas += 1;
      return;
    }

    const token = await getSellerOlistApiToken(pedido.seller_id);
    if (!token) {
      falhas += 1;
      return;
    }

    const warnings = await tryAttachOlistEtiquetaPdf({
      org_id: pedido.org_id,
      pedido_id: pedido.id,
      olist_pedido_id: olistPedidoId,
      token,
    });

    if (warnings.length === 0) {
      obtidas += 1;
      return;
    }

    pendentes += 1;
    const novasTentativas = (pedido.etiqueta_tentativas ?? 0) + 1;
    const criadoHaMuito = Date.now() - new Date(pedido.criado_em).getTime() > HORAS_ANTES_ALERTA * 3_600_000;
    const deveAlertar =
      !pedido.etiqueta_alerta_enviado_em &&
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
      console.error("[etiquetaOlistRetry] update:", pedido.id, updateErr.message);
    }

    if (deveAlertar) {
      await notifyAdminsEtiquetaOlistFalha({ org_id: pedido.org_id, pedido_id: pedido.id });
      alertasEnviados += 1;
    }
  });

  return { avaliados: pedidos.length, obtidas, pendentes, alertas_enviados: alertasEnviados, falhas };
}
