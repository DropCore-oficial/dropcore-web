import { addPedidoEvento } from "@/lib/erp/submitSellerErpPedido";
import { notifyFornecedorPedidoParaPostar } from "@/lib/notifyFornecedorPedidoParaPostar";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Mesmo prazo já usado pra reserva de estoque "em aberto" (estoqueReservaExpira.ts).
 *  Diferente de erro_saldo, aqui o estoque nunca foi debitado — expirar é só cancelar
 *  e avisar, sem reverter nada no estoque. */
export const SEM_ESTOQUE_TTL_MS = 72 * 60 * 60 * 1000;

export type PedidoSemEstoqueRow = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string | null;
  criado_em: string;
};

export function separarPedidosExpirados<T extends { criado_em: string }>(
  pedidos: T[],
): { ativos: T[]; expirados: T[] } {
  const limite = Date.now() - SEM_ESTOQUE_TTL_MS;
  const ativos: T[] = [];
  const expirados: T[] = [];
  for (const pedido of pedidos) {
    const criadoEm = new Date(pedido.criado_em).getTime();
    if (Number.isFinite(criadoEm) && criadoEm < limite) {
      expirados.push(pedido);
    } else {
      ativos.push(pedido);
    }
  }
  return { ativos, expirados };
}

/** Cancela um pedido `bloqueado`/`pendente_estoque` parado há mais de SEM_ESTOQUE_TTL_MS
 *  sem o fornecedor resolver, e notifica seller + fornecedor. Espelha
 *  pedidosErroSaldoRetry.ts (expirarPedidoErroSaldo), sem a etapa de reverter estoque. */
export async function expirarPedidoSemEstoque(
  pedido: PedidoSemEstoqueRow,
  statusOrigem: "bloqueado" | "pendente_estoque",
): Promise<boolean> {
  const { error: updateErr } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id)
    .eq("org_id", pedido.org_id)
    .eq("status", statusOrigem);

  if (updateErr) {
    console.error("[pedidoSemEstoqueExpira] update:", pedido.id, updateErr.message);
    return false;
  }

  await addPedidoEvento({
    org_id: pedido.org_id,
    pedido_id: pedido.id,
    tipo: "pedido_cancelado_sem_estoque_expirado",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: `Pedido cancelado: sem estoque disponível por mais de ${SEM_ESTOQUE_TTL_MS / 3_600_000}h.`,
  });

  await notifySellerPedidoAtencao({
    org_id: pedido.org_id,
    seller_id: pedido.seller_id,
    pedido_id: pedido.id,
    tipo: "pedido_sem_estoque_expirado",
    motivo: "Pedido cancelado: o estoque não foi reposto dentro do prazo.",
  });

  if (pedido.fornecedor_id) {
    await notifyFornecedorPedidoParaPostar({
      org_id: pedido.org_id,
      fornecedor_id: pedido.fornecedor_id,
      pedido_id: pedido.id,
      valor_fornecedor: 0,
      motivo: "bloqueado",
      motivo_bloqueio: "Pedido cancelado: estoque não foi reposto a tempo.",
    });
  }

  return true;
}
