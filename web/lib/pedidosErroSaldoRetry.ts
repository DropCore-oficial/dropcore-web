import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { addPedidoEvento, tryPromoteErroSaldoPedido } from "@/lib/erp/submitSellerErpPedido";
import { reverterEstoquePedido } from "@/lib/order/estoquePedido";
import { notifyFornecedorPedidoParaPostar } from "@/lib/notifyFornecedorPedidoParaPostar";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 3;
const MAX_PEDIDOS_PER_RUN = 200;
/** Prazo mais curto que o de reserva "em aberto" (72h): aqui já é venda confirmada
 *  com estoque debitado de verdade, então não pode ficar preso indefinidamente. */
const ERRO_SALDO_TTL_MS = 48 * 60 * 60 * 1000;

export type PedidosErroSaldoRetrySummary = {
  avaliados: number;
  promovidos: number;
  ainda_erro_saldo: number;
  falhas: number;
  expirados: number;
};

type PedidoRow = { id: string; org_id: string; seller_id: string; fornecedor_id: string | null; criado_em: string };

/**
 * Catch-all + expiração de pedidos `erro_saldo`: reavalia os que não foram pegos pelo
 * gatilho pontual (recarga de crédito / aprovação PIX), e expira (devolve estoque real,
 * cancela) os que ficaram parados há mais de ERRO_SALDO_TTL_MS sem o seller resolver o
 * saldo — nesse caso o estoque nunca foi revertido no momento da falha (ver comentário em
 * submitSellerErpPedido.ts), então é aqui que finalmente volta pro pool geral.
 */
export async function runPedidosErroSaldoRetry(params?: { seller_id?: string }): Promise<PedidosErroSaldoRetrySummary> {
  let query = supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, fornecedor_id, criado_em")
    .eq("status", "erro_saldo")
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN);

  if (params?.seller_id) {
    query = query.eq("seller_id", params.seller_id);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[pedidosErroSaldoRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, ainda_erro_saldo: 0, falhas: 0, expirados: 0 };
  }

  const limite = Date.now() - ERRO_SALDO_TTL_MS;
  const pedidos = (rows ?? []) as PedidoRow[];

  const expirados: PedidoRow[] = [];
  const ativos: PedidoRow[] = [];
  for (const pedido of pedidos) {
    const criadoEm = new Date(pedido.criado_em).getTime();
    if (Number.isFinite(criadoEm) && criadoEm < limite) {
      expirados.push(pedido);
    } else {
      ativos.push(pedido);
    }
  }

  let promovidos = 0;
  let aindaErroSaldo = 0;
  let falhas = 0;

  await mapWithConcurrency(ativos, RETRY_CONCURRENCY, async (pedido) => {
    const result = await tryPromoteErroSaldoPedido({ org_id: pedido.org_id, pedido_id: pedido.id });
    if (result.ok && result.outcome === "enviado") {
      promovidos += 1;
      return;
    }
    if (result.ok && result.outcome === "ainda_erro_saldo") {
      aindaErroSaldo += 1;
      return;
    }
    falhas += 1;
    if (!result.ok) {
      console.error("[pedidosErroSaldoRetry] falhou:", pedido.id, result.error_message);
    }
  });

  let expiradosCount = 0;
  await mapWithConcurrency(expirados, RETRY_CONCURRENCY, async (pedido) => {
    const ok = await expirarPedidoErroSaldo(pedido);
    if (ok) expiradosCount += 1;
    else falhas += 1;
  });

  return { avaliados: ativos.length, promovidos, ainda_erro_saldo: aindaErroSaldo, falhas, expirados: expiradosCount };
}

async function expirarPedidoErroSaldo(pedido: PedidoRow): Promise<boolean> {
  const { data: itens, error } = await supabaseAdmin
    .from("pedido_itens")
    .select("sku_id, quantidade")
    .eq("pedido_id", pedido.id);

  if (error) {
    console.error("[pedidosErroSaldoRetry] expirar (itens):", pedido.id, error.message);
    return false;
  }

  const debitos = (itens ?? [])
    .filter((it) => it.sku_id)
    .map((it) => ({
      sku_id: String(it.sku_id),
      sku: null,
      quantidade: Math.max(1, Number(it.quantidade ?? 1)),
      estoque_antes: 0,
      estoque_depois: 0,
    }));

  if (debitos.length > 0) {
    const rev = await reverterEstoquePedido(debitos);
    if (!rev.ok) {
      console.error("[pedidosErroSaldoRetry] expirar (reverter estoque):", pedido.id, rev.error_message, rev.detalhes);
      return false;
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id)
    .eq("org_id", pedido.org_id)
    .eq("status", "erro_saldo");

  if (updateErr) {
    console.error("[pedidosErroSaldoRetry] expirar (update):", pedido.id, updateErr.message);
    return false;
  }

  await addPedidoEvento({
    org_id: pedido.org_id,
    pedido_id: pedido.id,
    tipo: "pedido_cancelado_erro_saldo_expirado",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: `Pedido cancelado: saldo insuficiente por mais de ${ERRO_SALDO_TTL_MS / 3_600_000}h sem recarga.`,
  });

  await notifySellerPedidoAtencao({
    org_id: pedido.org_id,
    seller_id: pedido.seller_id,
    pedido_id: pedido.id,
    tipo: "erro_saldo_expirado",
    motivo: "Pedido cancelado por falta de recarga de saldo dentro do prazo. O estoque foi devolvido.",
  });

  if (pedido.fornecedor_id) {
    await notifyFornecedorPedidoParaPostar({
      org_id: pedido.org_id,
      fornecedor_id: pedido.fornecedor_id,
      pedido_id: pedido.id,
      valor_fornecedor: 0,
      motivo: "bloqueado",
      motivo_bloqueio: "Pedido cancelado: o seller não recarregou o saldo a tempo.",
    });
  }

  return true;
}
