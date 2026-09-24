/**
 * Núcleo compartilhado de processamento de uma notificação de shipment do Mercado Livre —
 * usado pelo webhook (tempo real) e pelo cron de segurança em
 * `pedidosEnviadoAutoPostadoRetry.ts` (mesma lição já aplicada em pedido novo e etiqueta:
 * webhook sozinho não é confiável). Detecta quando o ML confirma que o pacote foi
 * coletado/postado ou entregue ao cliente e promove o pedido automaticamente, reaproveitando
 * o mesmo núcleo (`pedidoPostadoPromote.ts`) que o clique manual do fornecedor/admin já usa.
 *
 * Exclusivo com Olist: mesma guarda de sempre — se o seller tiver Olist ativo, quem cobre a
 * confirmação de envio/entrega é o checker que já lê a `situacao` da própria Olist.
 */
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { promoverPedidoParaEntregue, promoverPedidoParaPostado } from "@/lib/pedidoPostadoPromote";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type MlShipmentDetalhe = {
  order_id?: number | string | null;
  status_history?: {
    date_shipped?: string | null;
    date_delivered?: string | null;
  } | null;
};

type PedidoAlvo = {
  id: string;
  org_id: string;
  status: string;
  ledger_id: string | null;
};

export type ProcessarShipmentMlResultado =
  | {
      ok: true;
      status:
        | "promovido_postado"
        | "promovido_entregue"
        | "sem_mudanca"
        | "pedido_nao_encontrado"
        | "ignorado_olist_ativo";
    }
  | { ok: false; retryable: boolean; motivo: string };

async function fetchShipment(
  shipmentId: string,
  accessToken: string
): Promise<{ ok: true; shipment: MlShipmentDetalhe } | { ok: false; retryable: boolean; status: number }> {
  const res = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.ok) return { ok: true, shipment: (await res.json()) as MlShipmentDetalhe };
  const retryable = res.status !== 404 && res.status !== 403;
  return { ok: false, retryable, status: res.status };
}

export async function processarShipmentMercadoLivre(params: {
  sellerId: string;
  shipmentId: string;
}): Promise<ProcessarShipmentMlResultado> {
  const { data: olistRow } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("seller_id", params.sellerId)
    .maybeSingle();
  if (olistRow?.olist_token_ciphertext) {
    return { ok: true, status: "ignorado_olist_ativo" };
  }

  const ctx = await getValidMercadoLivreAccessToken(params.sellerId);
  if (!ctx) return { ok: false, retryable: true, motivo: "Sem token válido do Mercado Livre." };

  const shipmentRes = await fetchShipment(params.shipmentId, ctx.accessToken);
  if (!shipmentRes.ok) {
    return {
      ok: false,
      retryable: shipmentRes.retryable,
      motivo: `Falha ao buscar shipment ${params.shipmentId} na API do ML (status ${shipmentRes.status}).`,
    };
  }

  const orderId = shipmentRes.shipment.order_id != null ? String(shipmentRes.shipment.order_id) : null;
  if (!orderId) return { ok: true, status: "pedido_nao_encontrado" };

  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, status, ledger_id, marketplace_pack_id")
    .eq("seller_id", params.sellerId)
    .eq("canal_venda", "mercado_livre")
    .eq("marketplace_numero", orderId)
    .maybeSingle();

  if (pedidoErr) return { ok: false, retryable: true, motivo: `Falha ao buscar pedido: ${pedidoErr.message}` };
  if (!pedido) return { ok: true, status: "pedido_nao_encontrado" };

  // Mesmo pack (comprador levou >1 unidade num único checkout) compartilha 1 shipment só —
  // o shipment só traz 1 order_id, então os irmãos (mesmo marketplace_pack_id) precisam ser
  // buscados à parte pra serem promovidos junto (ver docs/SCHEMA.md).
  const alvos: PedidoAlvo[] = [pedido];
  if (pedido.marketplace_pack_id) {
    const { data: irmaos } = await supabaseAdmin
      .from("pedidos")
      .select("id, org_id, status, ledger_id")
      .eq("seller_id", params.sellerId)
      .eq("marketplace_pack_id", pedido.marketplace_pack_id)
      .neq("id", pedido.id);
    for (const irmao of irmaos ?? []) alvos.push(irmao as PedidoAlvo);
  }

  const dataEnviado = shipmentRes.shipment.status_history?.date_shipped ?? null;
  const dataEntregue = shipmentRes.shipment.status_history?.date_delivered ?? null;

  let promoveuPostado = false;
  let promoveuEntregue = false;

  for (const alvo of alvos) {
    let statusAtual = alvo.status;

    if (dataEnviado && statusAtual === "enviado") {
      const promote = await promoverPedidoParaPostado({
        org_id: alvo.org_id,
        pedido_id: alvo.id,
        ledger_id: alvo.ledger_id,
        evento: {
          tipo: "pedido_postado_via_ml_shipment",
          origem: "sistema",
          actor_tipo: "sistema",
          descricao: "Postagem confirmada automaticamente pelo Mercado Livre (shipment).",
          metadata: { shipment_id: params.shipmentId, date_shipped: dataEnviado },
        },
      });
      if (promote.ok) {
        statusAtual = "aguardando_repasse";
        promoveuPostado = true;
      }
    }

    if (dataEntregue && statusAtual === "aguardando_repasse") {
      const promote = await promoverPedidoParaEntregue({
        org_id: alvo.org_id,
        pedido_id: alvo.id,
        evento: {
          tipo: "pedido_entregue_via_ml_shipment",
          origem: "sistema",
          actor_tipo: "sistema",
          descricao: "Entrega confirmada automaticamente pelo Mercado Livre (shipment).",
          metadata: { shipment_id: params.shipmentId, date_delivered: dataEntregue },
        },
      });
      if (promote.ok) promoveuEntregue = true;
    }
  }

  if (promoveuEntregue) return { ok: true, status: "promovido_entregue" };
  if (promoveuPostado) return { ok: true, status: "promovido_postado" };
  return { ok: true, status: "sem_mudanca" };
}
