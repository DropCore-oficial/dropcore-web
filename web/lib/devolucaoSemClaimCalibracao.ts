/**
 * Calibração (2026-10-31): a detecção de devolução hoje só escuta `claims` do ML — caso
 * real confirmado com a Vinz Collection, o comprador devolveu direto na logística ("me
 * arrependi"), sem abrir reclamação nenhuma, e o pipeline nunca veria isso. Antes de
 * inventar uma regra de detecção nova, essa rotina só observa: tira um snapshot (order +
 * shipment, mesmo allowlist seguro da calibração de claim) de todo pedido entregue que
 * ainda não foi repassado, e grava em `ml_devolucao_calibracao_log`. Quando uma devolução
 * sem claim se resolver de novo, o log mostra o campo real que mudou — daí sim dá pra
 * escrever a regra de detecção de verdade. Não trava dinheiro, não notifica, não decide
 * nada.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarOrderDetalheBruto,
  mlBuscarShipmentDetalheBruto,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";

const JANELA_DIAS = 60;
const RELOG_HORAS = 20;
const LIMITE_CANDIDATOS = 40;

const ORDER_CHAVES = ["id", "status", "status_detail", "date_created", "date_closed", "date_last_updated", "tags", "shipping"];
const SHIPMENT_CHAVES = ["id", "status", "substatus", "logistic_type", "date_created", "date_first_printed", "status_history", "shipping_option", "tracking_number", "source_site_id"];

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
  refId: string,
  tipo: "order" | "shipment",
  recursoId: string,
  payload: Record<string, unknown> | null
): Promise<void> {
  if (!payload) return;
  const { error } = await supabaseAdmin.rpc("fn_ml_devolucao_calibracao_log_registrar", {
    p_seller_id: sellerId,
    p_ml_claim_id: refId,
    p_tipo: tipo,
    p_recurso_id: recursoId,
    p_payload: payload,
  });
  if (error) console.error("[calibracao-sem-claim] erro ao persistir:", error.message);
}

export async function processarCalibracaoDevolucaoSemClaim(): Promise<{ candidatos: number; logados: number }> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: ledgers, error: ledgersErr } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, pedido_id, seller_id, status")
    .in("status", ["AGUARDANDO_REPASSE", "ENTREGUE", "EM_DEVOLUCAO"])
    .gte("criado_em", desde)
    .not("pedido_id", "is", null)
    .limit(200);
  if (ledgersErr) {
    console.error("[calibracao-sem-claim] erro ao buscar ledgers:", ledgersErr.message);
    return { candidatos: 0, logados: 0 };
  }
  if (!ledgers || ledgers.length === 0) return { candidatos: 0, logados: 0 };

  const pedidoIds = ledgers.map((l) => l.pedido_id as string);
  const { data: pedidos, error: pedidosErr } = await supabaseAdmin
    .from("pedidos")
    .select("id, seller_id, marketplace_numero")
    .in("id", pedidoIds);
  if (pedidosErr || !pedidos) {
    console.error("[calibracao-sem-claim] erro ao buscar pedidos:", pedidosErr?.message);
    return { candidatos: 0, logados: 0 };
  }

  const refIds = pedidos.map((p) => `sem-claim:${p.marketplace_numero}`);
  const recente = new Date(Date.now() - RELOG_HORAS * 60 * 60 * 1000).toISOString();
  const { data: jaLogados } = await supabaseAdmin
    .from("ml_devolucao_calibracao_log")
    .select("ml_claim_id")
    .in("ml_claim_id", refIds)
    .gte("criado_em", recente);
  const jaLogadosSet = new Set((jaLogados ?? []).map((r) => r.ml_claim_id));

  const candidatos = pedidos.filter((p) => !jaLogadosSet.has(`sem-claim:${p.marketplace_numero}`)).slice(0, LIMITE_CANDIDATOS);
  if (candidatos.length === 0) return { candidatos: 0, logados: 0 };

  const contextoPorSeller = new Map<string, MercadoLivreAuthContext | null>();
  let logados = 0;

  for (const pedido of candidatos) {
    const sellerId = pedido.seller_id as string;
    if (!contextoPorSeller.has(sellerId)) {
      contextoPorSeller.set(sellerId, await getValidMercadoLivreAccessToken(sellerId).catch(() => null));
    }
    const ctx = contextoPorSeller.get(sellerId);
    if (!ctx) continue;

    const refId = `sem-claim:${pedido.marketplace_numero}`;
    try {
      const orderBruto = await mlBuscarOrderDetalheBruto(String(pedido.marketplace_numero), ctx);
      const order = recorteSeguro(orderBruto, ORDER_CHAVES);
      await registrar(sellerId, refId, "order", String(pedido.marketplace_numero), order);

      const shippingId = (orderBruto?.shipping as { id?: number | string } | undefined)?.id;
      if (shippingId != null) {
        const shipment = recorteSeguro(await mlBuscarShipmentDetalheBruto(String(shippingId), ctx), SHIPMENT_CHAVES);
        await registrar(sellerId, refId, "shipment", String(shippingId), shipment);
      }
      logados++;
    } catch (e) {
      console.error(`[calibracao-sem-claim] erro no pedido ${pedido.id}:`, e);
    }
  }

  return { candidatos: candidatos.length, logados };
}
