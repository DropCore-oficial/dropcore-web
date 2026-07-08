import { liberarReservaEstoquePedido } from "@/lib/order/estoqueReserva";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Tempo de vida de uma reserva "ativa" antes de ser liberada automaticamente. */
const RESERVA_TTL_MS = 72 * 60 * 60 * 1000;

/** Evita um único cron travar tratando milhares de linhas de uma vez. */
const BATCH_SIZE = 200;

export type EstoqueReservaExpiraResult = {
  processadas: number;
  expiradas: number;
  falhas: string[];
};

/**
 * Libera reservas de estoque (pedidos Olist em_aberto) que ficaram `ativa` por mais
 * de `RESERVA_TTL_MS` sem o pedido aprovar nem cancelar na Olist — rede de segurança
 * para sellers sem webhook configurado (cancelamento em tempo real já libera via
 * `liberarReservaPorReferencia` em `sellerOlistPedidoImport.ts`).
 */
export async function processarEstoqueReservaExpiraCron(): Promise<EstoqueReservaExpiraResult> {
  const result: EstoqueReservaExpiraResult = { processadas: 0, expiradas: 0, falhas: [] };

  const limite = new Date(Date.now() - RESERVA_TTL_MS).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("estoque_reservas")
    .select("id, sku_id, quantidade")
    .eq("status", "ativa")
    .lt("criado_em", limite)
    .limit(BATCH_SIZE);

  if (error) {
    result.falhas.push(`Erro ao buscar reservas expiradas: ${error.message}`);
    return result;
  }

  for (const row of rows ?? []) {
    result.processadas++;
    const liberar = await liberarReservaEstoquePedido([
      { sku_id: row.sku_id as string, quantidade: Number(row.quantidade ?? 0) },
    ]);
    if (!liberar.ok) {
      result.falhas.push(`Reserva ${row.id}: ${liberar.error_message}`);
      continue;
    }
    const { error: updateErr } = await supabaseAdmin
      .from("estoque_reservas")
      .update({ status: "expirada", atualizado_em: new Date().toISOString() })
      .eq("id", row.id as string);
    if (updateErr) {
      result.falhas.push(`Reserva ${row.id}: liberada no estoque mas falhou ao marcar status (${updateErr.message}).`);
      continue;
    }
    result.expiradas++;
  }

  return result;
}
