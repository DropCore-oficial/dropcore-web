/**
 * Calibração temporária (2026-10-30, persistida em tabela a partir de 2026-10-31): ninguém
 * nunca confirmou se a API do ML expõe um sinal de "devolução entregue no fornecedor" — grava
 * um recorte seguro (status/datas/códigos) de cada reclamação aberta (e do shipment/order por
 * trás dela) toda vez que o webhook de "claims" dispara, em `ml_devolucao_calibracao_log`,
 * pra inspecionar via SQL quando uma devolução real chegar fisicamente — sem depender de
 * alguém estar vendo o log ao vivo (achado 2026-10-31: esse projeto na Vercel não tem
 * retenção/busca histórica de logs, só streaming ao vivo). Allowlist de propósito (nunca o
 * objeto bruto inteiro) — o payload real do ML traz dado pessoal do comprador (nome,
 * endereço, telefone) em campos como `receiver_address`/`sender_address`, que nunca deve ser
 * persistido. Não mexe em dinheiro, não decide nada — só observa. Remover (tabela + RPC +
 * esse arquivo) depois de calibrar o campo certo com um caso real.
 */
import { getValidMercadoLivreAccessToken, mlBuscarReclamacoesAbertas, mlBuscarReclamacaoDetalheBruto, mlBuscarOrderDetalheBruto, mlBuscarShipmentDetalheBruto } from "@/lib/mercadoLivreApiClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Só os campos estruturais que interessam pra achar o sinal de entrega — nunca endereço,
 * nome ou telefone do comprador/destinatário, mesmo que o ML devolva isso no payload. */
function recorteSeguro(obj: Record<string, unknown> | null, chaves: string[]): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of chaves) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

async function registrar(
  sellerId: string,
  mlClaimId: string,
  tipo: "claim" | "order" | "shipment",
  recursoId: string,
  payload: Record<string, unknown> | null
): Promise<void> {
  if (!payload) return;
  console.log(`[calibracao-devolucao] claim=${mlClaimId} ${tipo}=${recursoId} detalhe=`, JSON.stringify(payload));
  const { error } = await supabaseAdmin.rpc("fn_ml_devolucao_calibracao_log_registrar", {
    p_seller_id: sellerId,
    p_ml_claim_id: mlClaimId,
    p_tipo: tipo,
    p_recurso_id: recursoId,
    p_payload: payload,
  });
  if (error) console.error("[calibracao-devolucao] erro ao persistir:", error.message);
}

const CLAIM_CHAVES = ["id", "status", "type", "stage", "reason_id", "resource", "resource_id", "date_created", "resolution", "available_actions", "quantity_type"];
const ORDER_CHAVES = ["id", "status", "status_detail", "date_created", "date_closed", "date_last_updated", "tags", "shipping"];
const SHIPMENT_CHAVES = ["id", "status", "substatus", "logistic_type", "date_created", "date_first_printed", "status_history", "shipping_option", "tracking_number", "source_site_id"];

export async function logCalibracaoDevolucaoMlPorMlUserId(mlUserId: string): Promise<void> {
  try {
    const { data: integ } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id")
      .eq("ml_user_id", mlUserId)
      .maybeSingle();
    if (!integ?.seller_id) return;

    const ctx = await getValidMercadoLivreAccessToken(integ.seller_id);
    if (!ctx) return;

    const reclamacoes = await mlBuscarReclamacoesAbertas(ctx);
    for (const r of reclamacoes) {
      const claimId = String(r.id);
      const detalheClaim = recorteSeguro(await mlBuscarReclamacaoDetalheBruto(claimId, ctx), CLAIM_CHAVES);
      await registrar(integ.seller_id, claimId, "claim", claimId, detalheClaim);

      if (r.resource === "shipment") {
        const detalheShipment = recorteSeguro(await mlBuscarShipmentDetalheBruto(r.resourceId, ctx), SHIPMENT_CHAVES);
        await registrar(integ.seller_id, claimId, "shipment", r.resourceId, detalheShipment);
      } else if (r.resource === "order") {
        const detalheOrderBruto = await mlBuscarOrderDetalheBruto(r.resourceId, ctx);
        const detalheOrder = recorteSeguro(detalheOrderBruto, ORDER_CHAVES);
        // `shipping` embutido no pedido normalmente só traz { id }, mas reduz explicitamente
        // pra garantir que nenhum endereço/nome venha junto, mesmo que o ML mude o formato.
        const shippingId = (detalheOrderBruto?.shipping as { id?: number | string } | undefined)?.id;
        if (detalheOrder && shippingId != null) detalheOrder.shipping = { id: shippingId };
        await registrar(integ.seller_id, claimId, "order", r.resourceId, detalheOrder);
        if (shippingId != null) {
          const detalheShipment = recorteSeguro(await mlBuscarShipmentDetalheBruto(String(shippingId), ctx), SHIPMENT_CHAVES);
          await registrar(integ.seller_id, claimId, "shipment", String(shippingId), detalheShipment);
        }
      }
    }
  } catch (e) {
    console.error("[calibracao-devolucao] erro:", e);
  }
}
