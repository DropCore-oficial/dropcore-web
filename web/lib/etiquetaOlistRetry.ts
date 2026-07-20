import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { notifyAdminsEtiquetaOlistFalha } from "@/lib/notifyAdminsEtiquetaOlistFalha";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { isTinyRateLimitMessage } from "@/lib/olistTinyApi";
import { isSellerOlistRateLimited, markSellerOlistRateLimited } from "@/lib/olistRateLimitCooldown";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { tryAttachOlistEtiquetaPdf } from "@/lib/sellerOlistPedidoImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 2;
const MAX_PEDIDOS_PER_RUN = 100;
const MAX_TENTATIVAS_ANTES_ALERTA = 20;
const HORAS_ANTES_ALERTA = 24;
/** Evita alertar já na 1ª tentativa pra pedido que já nasceu "antigo" (ex.: backlog) — dá algumas rodadas de retry primeiro. */
const MIN_TENTATIVAS_PARA_ALERTA_POR_IDADE = 3;
/**
 * Acima disso, para de tentar automaticamente (o seller já foi alertado bem antes disso,
 * ver MAX_TENTATIVAS_ANTES_ALERTA=20, e já pode colar o link manualmente). Sem esse teto,
 * um pedido antigo permanentemente travado (ex.: nunca vai ter expedição gerada na Olist)
 * fica pra sempre na frente da fila (ordenada por criado_em) e — como o seller costuma
 * ficar bloqueado por rate limit já nos primeiros pedidos de cada rodada — pedidos NOVOS
 * nunca chegam a ser tentados de verdade. Confirmado ao vivo em 2026-07-20: pedido criado
 * há 40h+ tinha só 1 tentativa registrada, enquanto pedidos de semanas atrás já tinham
 * 700+, porque a fila nunca "andava" além deles.
 */
const MAX_TENTATIVAS_AUTO_RETRY = 50;
/**
 * A partir do primeiro alerta, continua lembrando o seller (e o botão manual do
 * fornecedor, que reaproveita esse mesmo cooldown) nesse intervalo enquanto o pedido
 * continuar sem etiqueta — antes disso `etiqueta_alerta_enviado_em` era "avisou uma vez
 * na vida e nunca mais", o que deixava o pedido esquecido se o seller não visse a
 * primeira notificação.
 */
const HORAS_ENTRE_LEMBRETES = 6;

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
    .lt("etiqueta_tentativas", MAX_TENTATIVAS_AUTO_RETRY)
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

  /** Rate limit da Tiny/Olist é por token (por seller) — uma vez detectado, pula o
   * resto dos pedidos DESSE seller nesta rodada em vez de continuar batendo numa API
   * que já sinalizou bloqueio (só atrasa a liberação e conta como tentativa à toa).
   * Também carrega quem já está em cooldown persistido (detectado por este cron ou por
   * outro — olist-sync, fornecedor-olist-sync-estoque, olist-sync-precos) pra nem tentar. */
  const sellerIds = [...new Set(pedidos.map((p) => p.seller_id))];
  const sellersBloqueados = new Set<string>();
  if (sellerIds.length > 0) {
    const { data: integracoes } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("seller_id, olist_rate_limited_until")
      .in("seller_id", sellerIds);
    for (const row of integracoes ?? []) {
      if (isSellerOlistRateLimited(row as { olist_rate_limited_until: string | null })) {
        sellersBloqueados.add((row as { seller_id: string }).seller_id);
      }
    }
  }

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    if (sellersBloqueados.has(pedido.seller_id)) {
      pendentes += 1;
      return;
    }

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

    if (warnings.some((w) => isTinyRateLimitMessage(w))) {
      sellersBloqueados.add(pedido.seller_id);
      await markSellerOlistRateLimited(pedido.seller_id);
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
      console.error("[etiquetaOlistRetry] update:", pedido.id, updateErr.message);
    }

    if (deveAlertar) {
      await notifyAdminsEtiquetaOlistFalha({ org_id: pedido.org_id, pedido_id: pedido.id });
      // O seller é quem tem acesso à Olist (token em seller_olist_integrations) — só ele
      // consegue ir lá pegar o link da etiqueta manualmente. Aviso ao admin acima fica
      // como visibilidade extra pra org, mas quem precisa agir é o seller.
      await notifySellerPedidoAtencao({
        org_id: pedido.org_id,
        seller_id: pedido.seller_id,
        pedido_id: pedido.id,
        tipo: "etiqueta_pendente_manual",
        motivo: `A etiqueta real de envio (Olist) não foi encontrada automaticamente depois de ${novasTentativas} tentativas. Entre em Pedidos e cole o link da etiqueta desse pedido.`,
      });
      alertasEnviados += 1;
    }
  });

  return { avaliados: pedidos.length, obtidas, pendentes, alertas_enviados: alertasEnviados, falhas };
}
