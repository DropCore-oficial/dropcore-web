import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { tryPromotePendenteEstoquePedido } from "@/lib/erp/submitSellerErpPedido";
import { expirarPedidoSemEstoque, separarPedidosExpirados } from "@/lib/order/pedidoSemEstoqueExpira";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 3;
const MAX_PEDIDOS_PER_RUN = 200;

export type PedidosPendenteEstoqueRetrySummary = {
  avaliados: number;
  promovidos: number;
  movidos_erro_saldo: number;
  ainda_pendentes: number;
  falhas: number;
  expirados: number;
};

type PedidoPendenteEstoqueRow = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string | null;
  criado_em: string;
};

type SellerRow = {
  id: string;
  fornecedor_id: string | null;
  plano: string | null;
};

/**
 * Catch-all pro status "pendente_estoque": reavalia periodicamente se já tem saldo pra
 * promover o pedido sem depender de um evento externo pra disparar a reconferência.
 * Espelha pedidosBloqueadosRetry.ts, que já existe pro status "bloqueado".
 */
export async function runPedidosPendenteEstoqueRetry(): Promise<PedidosPendenteEstoqueRetrySummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id, fornecedor_id, criado_em")
    .eq("status", "pendente_estoque")
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoPendenteEstoqueRow[]>();

  if (error) {
    console.error("[pedidosPendenteEstoqueRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, movidos_erro_saldo: 0, ainda_pendentes: 0, falhas: 0, expirados: 0 };
  }

  const { ativos, expirados } = separarPedidosExpirados(rows ?? []);
  const pedidos = ativos;
  let promovidos = 0;
  let movidosErroSaldo = 0;
  let aindaPendentes = 0;
  let falhas = 0;

  const sellerIds = [...new Set(pedidos.map((p) => p.seller_id))];
  const sellersById = new Map<string, SellerRow>();
  if (sellerIds.length > 0) {
    const { data: sellerRows } = await supabaseAdmin
      .from("sellers")
      .select("id, fornecedor_id, plano")
      .in("id", sellerIds)
      .returns<SellerRow[]>();
    for (const s of sellerRows ?? []) sellersById.set(s.id, s);
  }

  await mapWithConcurrency(pedidos, RETRY_CONCURRENCY, async (pedido) => {
    const seller = sellersById.get(pedido.seller_id);
    if (!seller) {
      falhas += 1;
      return;
    }

    const result = await tryPromotePendenteEstoquePedido({
      org_id: pedido.org_id,
      pedido_id: pedido.id,
      seller: {
        id: seller.id,
        fornecedor_id: seller.fornecedor_id,
        plano: seller.plano,
      },
    });

    if (result.ok) {
      promovidos += 1;
      return;
    }
    if (result.error_code === "ESTOQUE_INSUFICIENTE") {
      aindaPendentes += 1;
      return;
    }
    // SALDO_INSUFICIENTE já move o pedido pra "erro_saldo" (tem retry próprio) — não é falha daqui.
    if (result.error_code === "SALDO_INSUFICIENTE") {
      movidosErroSaldo += 1;
      return;
    }
    falhas += 1;
    console.error("[pedidosPendenteEstoqueRetry] falhou:", pedido.id, result.error_message);
  });

  let expiradosCount = 0;
  await mapWithConcurrency(expirados, RETRY_CONCURRENCY, async (pedido) => {
    const ok = await expirarPedidoSemEstoque(pedido, "pendente_estoque");
    if (ok) expiradosCount += 1;
    else falhas += 1;
  });

  return {
    avaliados: pedidos.length,
    promovidos,
    movidos_erro_saldo: movidosErroSaldo,
    ainda_pendentes: aindaPendentes,
    falhas,
    expirados: expiradosCount,
  };
}
