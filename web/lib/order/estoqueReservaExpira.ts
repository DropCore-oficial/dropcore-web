import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { processOlistPedidoImport } from "@/lib/sellerOlistPedidoImport";
import { liberarReservaEstoquePedido } from "@/lib/order/estoqueReserva";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Tempo de vida de uma reserva "ativa" antes de ser liberada automaticamente. */
const RESERVA_TTL_MS = 72 * 60 * 60 * 1000;

/** Evita um único cron travar tratando milhares de linhas de uma vez. */
const BATCH_SIZE = 200;
const RECHECK_CONCURRENCY = 3;

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

export type EstoqueReservaRecheckResult = {
  avaliadas: number;
  promovidas: number;
  ainda_pendentes: number;
  falhas: string[];
};

function parseOlistPedidoId(referenciaExterna: string | null): number | null {
  if (!referenciaExterna?.startsWith("olist:")) return null;
  const n = Number(referenciaExterna.slice("olist:".length));
  return Number.isFinite(n) ? n : null;
}

/**
 * Reavalia reservas "ativa" ainda não expiradas contra a situação ATUAL na Olist.
 * Sem isso, uma reserva só é revisitada quando cancela (webhook) ou quando expira por
 * TTL (72h) — um pedido "em aberto"/"dados incompletos" que só é pago dias depois (ex.:
 * boleto Shopee) nunca era reprocessado, porque a sincronização normal busca pedidos por
 * `dataInicial/dataFinal` (data de CRIAÇÃO) e o pedido já saiu dessa janela. Aqui a busca
 * é direta pelo id do pedido (via `processOlistPedidoImport`), não depende de janela.
 */
export async function recheckReservasAtivas(): Promise<EstoqueReservaRecheckResult> {
  const result: EstoqueReservaRecheckResult = { avaliadas: 0, promovidas: 0, ainda_pendentes: 0, falhas: [] };

  const limite = new Date(Date.now() - RESERVA_TTL_MS).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("estoque_reservas")
    .select("org_id, seller_id, referencia_externa")
    .eq("status", "ativa")
    .gte("criado_em", limite)
    .limit(BATCH_SIZE);

  if (error) {
    result.falhas.push(`Erro ao buscar reservas ativas: ${error.message}`);
    return result;
  }

  const unicos = new Map<string, { org_id: string; seller_id: string; olist_pedido_id: number }>();
  for (const row of rows ?? []) {
    const olistPedidoId = parseOlistPedidoId(row.referencia_externa as string | null);
    if (olistPedidoId == null) continue;
    const key = `${row.seller_id}:${olistPedidoId}`;
    if (!unicos.has(key)) {
      unicos.set(key, { org_id: row.org_id as string, seller_id: row.seller_id as string, olist_pedido_id: olistPedidoId });
    }
  }

  const sellerIds = [...new Set([...unicos.values()].map((v) => v.seller_id))];
  const tokensPorSeller = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: integracoes } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("seller_id, olist_token_ciphertext")
      .in("seller_id", sellerIds);
    for (const row of integracoes ?? []) {
      if (row.olist_token_ciphertext) tokensPorSeller.set(row.seller_id as string, row.olist_token_ciphertext as string);
    }
  }

  const itens = [...unicos.values()].filter((v) => tokensPorSeller.has(v.seller_id));

  await mapWithConcurrency(itens, RECHECK_CONCURRENCY, async (item) => {
    result.avaliadas += 1;
    try {
      const proc = await processOlistPedidoImport({
        org_id: item.org_id,
        seller_id: item.seller_id,
        olist_token_ciphertext: tokensPorSeller.get(item.seller_id)!,
        olist_pedido_id: item.olist_pedido_id,
      });
      if (!proc.ok) {
        result.falhas.push(`Pedido ${item.olist_pedido_id}: ${proc.error}`);
        return;
      }
      if (proc.outcome === "reservado_estoque") {
        result.ainda_pendentes += 1;
      } else {
        result.promovidas += 1;
      }
    } catch (e: unknown) {
      result.falhas.push(`Pedido ${item.olist_pedido_id}: ${e instanceof Error ? e.message : "erro inesperado"}`);
    }
  });

  return result;
}
