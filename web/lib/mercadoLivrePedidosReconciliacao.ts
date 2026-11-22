/**
 * Rede de segurança pro webhook do ML — webhook sozinho não é confiável (notificação pode
 * nunca chegar, API instável, deploy no meio, seller reconectando token, etc.). Varre
 * pedidos recentes de cada seller com ML conectado e importa o que o webhook não pegou.
 *
 * Janela de 24h com cron a cada 15 min (achado real 2026-10-24: venda real no ML do seller
 * Vinz Collection nunca virou pedido no DropCore — a janela de 3h de antes não dava margem
 * suficiente pra cobrir uma rodada perdida por token/erro pontual, e cada seller tinha só
 * uma chance por pedido dentro daquela janela curta). `ingerirPedidoMercadoLivrePorSeller`
 * já é idempotente (PEDIDO_DUPLICADO vira "duplicado", não erro), então rever o mesmo
 * pedido várias vezes em janelas sobrepostas é barato e seguro — o limite por seller
 * (MAX_PEDIDOS_POR_SELLER) continua segurando o custo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { ingerirPedidoMercadoLivrePorSeller } from "@/lib/mercadoLivrePedidoIngest";
import { registrarMlSyncFalha } from "@/lib/mlSyncFalhas";

const JANELA_HORAS = 24;
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
    // FK explícita (seller_id) — a tabela também tem linked_seller_id apontando pra
    // sellers, e sem desambiguar o embed falha com "more than one relationship" e a query
    // inteira retorna erro (achado ao vivo 2026-10-25: isso zerava silenciosamente
    // sellers_verificados, sem aparecer em lugar nenhum fora do console.error).
    .select("seller_id, ml_user_id, sellers!seller_mercadolivre_integrations_seller_id_fkey(org_id, fornecedor_id)")
    .not("ml_access_token", "is", null);
  if (error) {
    console.error("[mercadoLivrePedidosReconciliacao] listar integrações:", error.message);
    return summary;
  }

  for (const integ of integracoes ?? []) {
    if (!integ.ml_user_id) continue;
    summary.sellers_verificados += 1;

    // Isolamento por seller — achado real 2026-10-24: antes, uma exceção (ex.: fetch
    // falhando por instabilidade de rede) num seller abortava o processamento de TODOS os
    // sellers seguintes nessa mesma rodada, sem nenhum rastro (o cron roda de novo em 15
    // min, mas se o mesmo seller travar sempre, os seguintes na ordem nunca são verificados).
    try {
      const sellerRow = integ.sellers as { org_id?: string; fornecedor_id?: string } | null;
      const orgId = sellerRow?.org_id;
      const fornecedorId = sellerRow?.fornecedor_id ?? null;

      const ctx = await getValidMercadoLivreAccessToken(integ.seller_id);
      if (!ctx) continue;

      const orderIds = await buscarPedidosRecentes(integ.ml_user_id, ctx.accessToken);
      summary.pedidos_encontrados += orderIds.length;

      for (const orderId of orderIds) {
        try {
          const resultado = await ingerirPedidoMercadoLivrePorSeller({ sellerId: integ.seller_id, orderId });
          if (resultado.ok) {
            if (resultado.status === "duplicado") summary.pedidos_ja_existentes += 1;
            else if (
              resultado.status === "novo" ||
              resultado.status === "bloqueado" ||
              resultado.status === "pendente_estoque" ||
              resultado.status === "produto_nao_vinculado" ||
              resultado.status === "anuncio_sem_sku"
            ) {
              summary.pedidos_novos += 1;
            }
          } else {
            summary.falhas += 1;
            console.error(`[mercadoLivrePedidosReconciliacao] pedido ${orderId} (seller ${integ.seller_id}):`, resultado.motivo);
            if (orgId) {
              await registrarMlSyncFalha({
                orgId,
                sellerId: integ.seller_id,
                fornecedorId,
                tipo: "pedido_ingest",
                referenciaExterna: orderId,
                erro: resultado.motivo,
              });
            }
          }
        } catch (e: unknown) {
          // Isolamento por pedido — 1 exceção aqui não pode impedir os outros pedidos
          // do mesmo seller nessa rodada.
          summary.falhas += 1;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[mercadoLivrePedidosReconciliacao] pedido ${orderId} (seller ${integ.seller_id}) excecao:`, e);
          if (orgId) {
            await registrarMlSyncFalha({
              orgId,
              sellerId: integ.seller_id,
              fornecedorId,
              tipo: "pedido_ingest",
              referenciaExterna: orderId,
              erro: msg,
            });
          }
        }
      }
    } catch (e: unknown) {
      summary.falhas += 1;
      console.error(`[mercadoLivrePedidosReconciliacao] seller ${integ.seller_id} excecao:`, e);
    }
  }

  return summary;
}
