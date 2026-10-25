/**
 * Retry das falhas registradas em ml_sync_falhas (push de estoque pro ML ou ingestão de
 * pedido do ML) — ver web/scripts/create-ml-sync-falhas-log-retry.sql. Reusa 100% do
 * pipeline real de cada caminho, só reage ao resultado pra marcar resolvido/esgotado.
 */
import { syncMercadoLivreEstoqueSkusSeller } from "@/lib/sellerMercadoLivreSyncEstoque";
import { ingerirPedidoMercadoLivrePorSeller } from "@/lib/mercadoLivrePedidoIngest";
import { listarMlSyncFalhasPendentes, marcarResultadoMlSyncFalha } from "@/lib/mlSyncFalhas";

export type MlSyncRetrySummary = {
  avaliadas: number;
  resolvidas: number;
  ainda_pendentes: number;
};

const LIMITE_POR_RODADA = 50;

export async function runMlSyncRetry(): Promise<MlSyncRetrySummary> {
  const pendentes = await listarMlSyncFalhasPendentes(LIMITE_POR_RODADA);
  const summary: MlSyncRetrySummary = { avaliadas: pendentes.length, resolvidas: 0, ainda_pendentes: 0 };

  for (const falha of pendentes) {
    try {
      if (falha.tipo === "estoque_push") {
        if (!falha.sku || !falha.fornecedor_id) {
          summary.ainda_pendentes += 1;
          continue;
        }
        const resultado = await syncMercadoLivreEstoqueSkusSeller({
          sellerId: falha.seller_id,
          orgId: falha.org_id,
          fornecedorId: falha.fornecedor_id,
          skuCodes: [falha.sku],
        });
        const aindaFalhando = resultado.falhas.some((f) => f.ml_item_id === falha.ml_item_id);
        if (resultado.itens_atualizados > 0 && !aindaFalhando) {
          await marcarResultadoMlSyncFalha(falha.id, true);
          summary.resolvidas += 1;
        } else {
          const erro = resultado.falhas.find((f) => f.ml_item_id === falha.ml_item_id)?.erro ?? "sem itens atualizados";
          await marcarResultadoMlSyncFalha(falha.id, false, erro);
          summary.ainda_pendentes += 1;
        }
      } else {
        if (!falha.referencia_externa) {
          summary.ainda_pendentes += 1;
          continue;
        }
        const resultado = await ingerirPedidoMercadoLivrePorSeller({
          sellerId: falha.seller_id,
          orderId: falha.referencia_externa,
        });
        if (resultado.ok) {
          await marcarResultadoMlSyncFalha(falha.id, true);
          summary.resolvidas += 1;
        } else {
          await marcarResultadoMlSyncFalha(falha.id, false, resultado.motivo);
          summary.ainda_pendentes += 1;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[mlSyncRetry]", falha.id, falha.tipo, e);
      await marcarResultadoMlSyncFalha(falha.id, false, msg);
      summary.ainda_pendentes += 1;
    }
  }

  return summary;
}
