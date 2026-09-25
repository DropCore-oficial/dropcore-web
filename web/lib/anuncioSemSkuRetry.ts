/**
 * Cron: tenta promover pedidos `anuncio_sem_sku` (anúncio do Mercado Livre sem SKU
 * cadastrado na variação vendida) sempre que o seller cadastrar o SKU certo, e dispara
 * um alerta de urgência (painel + e-mail, uma vez só por pedido) quando o prazo de
 * despacho do marketplace estiver a menos de 6h e o pedido ainda não tiver sido
 * resolvido — sem isso o seller só descobre que o prazo passou depois de tarde.
 *
 * Corte de 15 dias: depois disso para de tentar promoção automática (o placeholder
 * continua visível/badge no painel, só não fica mais em loop de fundo por um pedido
 * provavelmente já perdido/cancelado no marketplace).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tryPromoteAnuncioSemSkuPedido } from "@/lib/mercadoLivrePedidoIngest";
import { notifySellerAnuncioSemSku } from "@/lib/notifySellerAnuncioSemSku";
import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";

const MAX_PEDIDOS_POR_RUN = 200;
const JANELA_DIAS = 15;
const URGENCIA_HORAS_RESTANTES = 6;

export type AnuncioSemSkuRetrySummary = {
  avaliados: number;
  promovidos: number;
  urgentes_notificados: number;
  falhas: number;
};

type PedidoAnuncioSemSku = {
  id: string;
  org_id: string;
  seller_id: string;
  nome_produto: string | null;
  sla_prazo_despacho: string | null;
};

export async function runAnuncioSemSkuRetry(): Promise<AnuncioSemSkuRetrySummary> {
  const summary: AnuncioSemSkuRetrySummary = { avaliados: 0, promovidos: 0, urgentes_notificados: 0, falhas: 0 };

  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, nome_produto, sla_prazo_despacho")
    .eq("status", "anuncio_sem_sku")
    .gt("criado_em", desde)
    .limit(MAX_PEDIDOS_POR_RUN)
    .returns<PedidoAnuncioSemSku[]>();

  if (error) {
    console.error("[anuncioSemSkuRetry] listar:", error.message);
    return summary;
  }

  const pedidos = rows ?? [];
  if (pedidos.length === 0) return summary;
  summary.avaliados = pedidos.length;

  const agora = Date.now();
  const limiteUrgencia = URGENCIA_HORAS_RESTANTES * 60 * 60 * 1000;

  for (const pedido of pedidos) {
    const resultado = await tryPromoteAnuncioSemSkuPedido({ pedido_id: pedido.id });

    if (!resultado.ok) {
      summary.falhas += 1;
      console.error(`[anuncioSemSkuRetry] pedido ${pedido.id}:`, resultado.error_message);
      continue;
    }

    if (resultado.outcome === "promovido") {
      summary.promovidos += 1;
      continue;
    }

    // ainda_sem_sku — confere se o prazo de despacho já está próximo pra disparar o
    // alerta de urgência (só 1x por pedido).
    if (!pedido.sla_prazo_despacho) continue;
    const prazoMs = new Date(pedido.sla_prazo_despacho).getTime();
    if (Number.isNaN(prazoMs) || prazoMs - agora > limiteUrgencia) continue;

    const { data: jaNotificado } = await supabaseAdmin
      .from("pedido_eventos")
      .select("id")
      .eq("pedido_id", pedido.id)
      .eq("tipo", "anuncio_sem_sku_urgente")
      .limit(1)
      .maybeSingle();
    if (jaNotificado) continue;

    await notifySellerAnuncioSemSku({
      org_id: pedido.org_id,
      seller_id: pedido.seller_id,
      pedido_id: pedido.id,
      nome_produto: pedido.nome_produto ?? "produto do Mercado Livre",
      sla_prazo_despacho: pedido.sla_prazo_despacho,
      urgente: true,
    });

    await addPedidoEvento({
      org_id: pedido.org_id,
      pedido_id: pedido.id,
      tipo: "anuncio_sem_sku_urgente",
      origem: "sistema",
      actor_tipo: "sistema",
      descricao: "Alerta de urgência disparado — prazo de despacho perto e SKU ainda não cadastrado.",
    });

    summary.urgentes_notificados += 1;
  }

  return summary;
}
