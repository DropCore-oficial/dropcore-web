import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { tryPromoteBloqueadoPedido } from "@/lib/erp/submitSellerErpPedido";
import { expirarPedidoSemEstoque, separarPedidosExpirados, type PedidoSemEstoqueRow } from "@/lib/order/pedidoSemEstoqueExpira";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 3;
const MAX_PEDIDOS_PER_RUN = 200;

export type PedidosBloqueadosRetrySummary = {
  avaliados: number;
  promovidos: number;
  ainda_bloqueados: number;
  falhas: number;
  expirados: number;
};

/**
 * Catch-all: reavalia pedidos `bloqueado` que não foram pegos pelos gatilhos pontuais
 * (habilitar SKU, reimport duplicado) — ex: inadimplência resolvida ou despacho/CD misto
 * corrigido pelo fornecedor editando o SKU, sem nenhum "evento" óbvio pra instrumentar.
 * `idx_pedidos_status` já existe no banco (sem uso até agora) -- essa query passa a usá-lo.
 * Também expira (cancela) os que ficaram parados há mais de SEM_ESTOQUE_TTL_MS — ver
 * pedidoSemEstoqueExpira.ts.
 */
export async function runPedidosBloqueadosRetry(): Promise<PedidosBloqueadosRetrySummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, fornecedor_id, criado_em")
    .eq("status", "bloqueado")
    .eq("e_teste", false)
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN);

  if (error) {
    console.error("[pedidosBloqueadosRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, ainda_bloqueados: 0, falhas: 0, expirados: 0 };
  }

  const { ativos, expirados } = separarPedidosExpirados((rows ?? []) as PedidoSemEstoqueRow[]);
  let promovidos = 0;
  let aindaBloqueados = 0;
  let falhas = 0;

  await mapWithConcurrency(ativos, RETRY_CONCURRENCY, async (pedido) => {
    const result = await tryPromoteBloqueadoPedido({ org_id: pedido.org_id, pedido_id: pedido.id });
    if (result.ok) {
      promovidos += 1;
      return;
    }
    if ("outcome" in result && result.outcome === "ainda_bloqueado") {
      aindaBloqueados += 1;
      return;
    }
    falhas += 1;
    console.error("[pedidosBloqueadosRetry] falhou:", pedido.id, result.error_message);
  });

  let expiradosCount = 0;
  await mapWithConcurrency(expirados, RETRY_CONCURRENCY, async (pedido) => {
    const ok = await expirarPedidoSemEstoque(pedido, "bloqueado");
    if (ok) expiradosCount += 1;
    else falhas += 1;
  });

  return { avaliados: ativos.length, promovidos, ainda_bloqueados: aindaBloqueados, falhas, expirados: expiradosCount };
}
