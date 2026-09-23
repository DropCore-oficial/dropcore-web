/**
 * Rede de segurança pro webhook do ML — mesma lição já aprendida com a Olist: webhook
 * sozinho não é confiável (notificação pode nunca chegar, API instável, deploy no meio,
 * seller reconectando token, etc.). Varre pedidos recentes de cada seller com ML direto
 * conectado (e sem Olist ativo, pra não duplicar) e importa o que o webhook não pegou.
 *
 * Janela de 3h com cron a cada 15 min: sobra de margem generosa (12x o intervalo) pra
 * cobrir qualquer atraso de notificação sem reprocessar o catálogo inteiro a cada run —
 * `ingerirPedidoMercadoLivrePorSeller` já é idempotente (PEDIDO_DUPLICADO vira "duplicado",
 * não erro), então rever o mesmo pedido várias vezes em janelas sobrepostas é barato e seguro.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { ingerirPedidoMercadoLivrePorSeller } from "@/lib/mercadoLivrePedidoIngest";

const JANELA_HORAS = 3;
const MAX_PEDIDOS_POR_SELLER = 50;

export type MercadoLivreReconciliacaoSummary = {
  sellers_verificados: number;
  pedidos_encontrados: number;
  pedidos_novos: number;
  pedidos_ja_existentes: number;
  falhas: number;
};

type MlOrderSearchResult = { results?: Array<{ id: number | string }> };

async function buscarPedidosRecentes(mlUserId: string, accessToken: string): Promise<string[]> {
  const to = new Date();
  const from = new Date(to.getTime() - JANELA_HORAS * 60 * 60 * 1000);
  const url = `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&order.date_created.from=${encodeURIComponent(
    from.toISOString()
  )}&order.date_created.to=${encodeURIComponent(to.toISOString())}&sort=date_desc&limit=${MAX_PEDIDOS_POR_SELLER}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as MlOrderSearchResult;
  return (json.results ?? []).map((o) => String(o.id));
}

export async function runMercadoLivrePedidosReconciliacao(): Promise<MercadoLivreReconciliacaoSummary> {
  const summary: MercadoLivreReconciliacaoSummary = {
    sellers_verificados: 0,
    pedidos_encontrados: 0,
    pedidos_novos: 0,
    pedidos_ja_existentes: 0,
    falhas: 0,
  };

  const { data: integracoes, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("seller_id, ml_user_id")
    .not("ml_access_token", "is", null);
  if (error) {
    console.error("[mercadoLivrePedidosReconciliacao] listar integrações:", error.message);
    return summary;
  }

  for (const integ of integracoes ?? []) {
    if (!integ.ml_user_id) continue;
    summary.sellers_verificados += 1;

    const { data: olistRow } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("olist_token_ciphertext")
      .eq("seller_id", integ.seller_id)
      .maybeSingle();
    if (olistRow?.olist_token_ciphertext) continue; // exclusivo — mesma trava do webhook

    const ctx = await getValidMercadoLivreAccessToken(integ.seller_id);
    if (!ctx) continue;

    const orderIds = await buscarPedidosRecentes(integ.ml_user_id, ctx.accessToken);
    summary.pedidos_encontrados += orderIds.length;

    for (const orderId of orderIds) {
      const resultado = await ingerirPedidoMercadoLivrePorSeller({ sellerId: integ.seller_id, orderId });
      if (resultado.ok) {
        if (resultado.status === "duplicado") summary.pedidos_ja_existentes += 1;
        else if (resultado.status === "novo" || resultado.status === "bloqueado" || resultado.status === "pendente_estoque") {
          summary.pedidos_novos += 1;
        }
      } else {
        summary.falhas += 1;
        console.error(`[mercadoLivrePedidosReconciliacao] pedido ${orderId} (seller ${integ.seller_id}):`, resultado.motivo);
      }
    }
  }

  return summary;
}
