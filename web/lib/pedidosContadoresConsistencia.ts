/**
 * Checagem periódica de consistência dos contadores de aba de pedidos (seller e fornecedor)
 * — achado real 2026-11-11: `fn_seller_pedidos_lista` escolhia 1 pedido representante por
 * pacote (`DISTINCT ON ... ORDER BY criado_em DESC`) pra contar a aba "Devolução", e quando
 * um pacote tinha itens em status diferentes, a devolução sumia da contagem (corrigido em
 * `fix-seller-pedidos-contadores-pacote-status-divergente.sql`). Essa rotina compara o que
 * as funções de produção devolvem contra um "ground truth" calculado por fora
 * (`fn_seller_pedidos_contadores_ground_truth`/`fn_fornecedor_pedidos_contadores_ground_truth`,
 * escritas de propósito sem reaproveitar a lógica das funções de produção — se reaproveitasse,
 * um bug nelas se repetiria aqui e a checagem nunca acusaria nada). Não corrige nada sozinha,
 * só avisa o admin — é rede de segurança, não correção automática.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminContadorPedidosDivergente } from "@/lib/notifyAdminContadorPedidosDivergente";

export async function verificarConsistenciaContadoresPedidos(): Promise<{
  sellersVerificados: number;
  fornecedoresVerificados: number;
  divergenciasEncontradas: number;
  erros: number;
}> {
  let divergenciasEncontradas = 0;
  let erros = 0;

  const [sellersRows, fornecedoresRows, groundTruthSellerRows, groundTruthFornecedorRows] = await Promise.all([
    supabaseAdmin.from("sellers").select("id, org_id, nome"),
    supabaseAdmin.from("fornecedores").select("id, org_id, nome"),
    supabaseAdmin.rpc("fn_seller_pedidos_contadores_ground_truth"),
    supabaseAdmin.rpc("fn_fornecedor_pedidos_contadores_ground_truth"),
  ]);

  const groundTruthSeller = new Map(
    ((groundTruthSellerRows.data ?? []) as Array<{ seller_id: string; devolucao: number }>).map((r) => [
      r.seller_id,
      Number(r.devolucao),
    ])
  );
  const groundTruthFornecedor = new Map(
    ((groundTruthFornecedorRows.data ?? []) as Array<{ fornecedor_id: string; devolucao: number }>).map((r) => [
      r.fornecedor_id,
      Number(r.devolucao),
    ])
  );

  let sellersVerificados = 0;
  for (const seller of (sellersRows.data ?? []) as Array<{ id: string; org_id: string; nome: string | null }>) {
    const real = groundTruthSeller.get(seller.id) ?? 0;
    try {
      sellersVerificados++;
      const { data: linhas } = await supabaseAdmin.rpc("fn_seller_pedidos_lista", {
        p_org_id: seller.org_id,
        p_seller_id: seller.id,
        p_status: null,
        p_limit: 1,
        p_offset: 0,
      });
      const mostrado = Number(
        (Array.isArray(linhas) ? linhas[0] : linhas)?.total_count_devolucao ?? 0
      );
      if (mostrado !== real) {
        divergenciasEncontradas++;
        await notifyAdminContadorPedidosDivergente({
          org_id: seller.org_id,
          entidade_tipo: "seller",
          entidade_id: seller.id,
          entidade_nome: seller.nome,
          categoria: "Devolução",
          contador_mostrado: mostrado,
          contador_real: real,
        });
      }
    } catch (e) {
      erros++;
      console.error(`[pedidos-contadores-consistencia] erro no seller ${seller.id}:`, e);
    }
  }

  let fornecedoresVerificados = 0;
  for (const fornecedor of (fornecedoresRows.data ?? []) as Array<{ id: string; org_id: string; nome: string | null }>) {
    const real = groundTruthFornecedor.get(fornecedor.id) ?? 0;
    try {
      fornecedoresVerificados++;
      const { data: linhas } = await supabaseAdmin.rpc("fn_fornecedor_pedidos_lista", {
        p_org_id: fornecedor.org_id,
        p_fornecedor_id: fornecedor.id,
        p_status: null,
        p_limit: 1,
        p_offset: 0,
      });
      const mostrado = Number(
        (Array.isArray(linhas) ? linhas[0] : linhas)?.total_count_devolucao ?? 0
      );
      if (mostrado !== real) {
        divergenciasEncontradas++;
        await notifyAdminContadorPedidosDivergente({
          org_id: fornecedor.org_id,
          entidade_tipo: "fornecedor",
          entidade_id: fornecedor.id,
          entidade_nome: fornecedor.nome,
          categoria: "Devolução",
          contador_mostrado: mostrado,
          contador_real: real,
        });
      }
    } catch (e) {
      erros++;
      console.error(`[pedidos-contadores-consistencia] erro no fornecedor ${fornecedor.id}:`, e);
    }
  }

  return { sellersVerificados, fornecedoresVerificados, divergenciasEncontradas, erros };
}
