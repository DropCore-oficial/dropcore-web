import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { tryPromotePendenteEstoquePedido } from "@/lib/erp/submitSellerErpPedido";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RETRY_CONCURRENCY = 3;
const MAX_PEDIDOS_PER_RUN = 200;

export type PedidosPendenteEstoqueRetrySummary = {
  avaliados: number;
  promovidos: number;
  movidos_erro_saldo: number;
  ainda_pendentes: number;
  falhas: number;
};

type PedidoPendenteEstoqueRow = { id: string; org_id: string; seller_id: string };

type SellerRow = {
  id: string;
  fornecedor_id: string | null;
  plano: string | null;
  erp_estoque_webhook_url: string | null;
  erp_estoque_webhook_secret: string | null;
};

/**
 * Catch-all pro status "pendente_estoque": sem isso, um pedido só sai desse status
 * quando o sync da Olist tenta reimportar o MESMO pedido de novo e bate em duplicidade
 * (ver processOlistPedidoImport → tryPromotePendenteEstoquePedido) — o que não acontece
 * se o pedido já saiu da janela de busca por data. Espelha pedidosBloqueadosRetry.ts,
 * que já existe pro status "bloqueado".
 */
export async function runPedidosPendenteEstoqueRetry(): Promise<PedidosPendenteEstoqueRetrySummary> {
  const { data: rows, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, org_id, seller_id")
    .eq("status", "pendente_estoque")
    .order("criado_em", { ascending: true })
    .limit(MAX_PEDIDOS_PER_RUN)
    .returns<PedidoPendenteEstoqueRow[]>();

  if (error) {
    console.error("[pedidosPendenteEstoqueRetry] listar:", error.message);
    return { avaliados: 0, promovidos: 0, movidos_erro_saldo: 0, ainda_pendentes: 0, falhas: 0 };
  }

  const pedidos = rows ?? [];
  let promovidos = 0;
  let movidosErroSaldo = 0;
  let aindaPendentes = 0;
  let falhas = 0;

  const sellerIds = [...new Set(pedidos.map((p) => p.seller_id))];
  const sellersById = new Map<string, SellerRow>();
  if (sellerIds.length > 0) {
    const { data: sellerRows } = await supabaseAdmin
      .from("sellers")
      .select("id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
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
        erp_estoque_webhook_url: seller.erp_estoque_webhook_url,
        erp_estoque_webhook_secret: seller.erp_estoque_webhook_secret,
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

  return {
    avaliados: pedidos.length,
    promovidos,
    movidos_erro_saldo: movidosErroSaldo,
    ainda_pendentes: aindaPendentes,
    falhas,
  };
}
