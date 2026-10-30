/**
 * Libera automaticamente o valor bloqueado numa devolução quando o fornecedor não confirma
 * nem contesta em 48h (contadas a partir de `em_devolucao_desde`, gravado quando o admin
 * registra EM_DEVOLUCAO — ver web/app/api/org/financial/ledger/[id]/route.ts). Decisão Sr
 * Stark 2026-10-29: devolução não pode ficar bloqueada pra sempre esperando um fornecedor
 * omisso — a confirmação positiva do fornecedor continua liberando na hora
 * (fn_devolucao_fornecedor_confirmar), isto aqui é só a rede de segurança pro silêncio.
 *
 * A seleção dos elegíveis é leitura em lote de sistema (mesmo padrão de
 * pedidoSlaAtrasoCheck.ts) — a mutação de dinheiro em si vai sempre pela RPC
 * fn_devolucao_liberar_automatico (atômica, reconfere tudo de novo antes de mexer).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { notifyFornecedorDevolucaoLiberadaAutomatico } from "@/lib/notifyFornecedorDevolucaoLiberadaAutomatico";

const PRAZO_HORAS = 48;
const MAX_POR_RUN = 200;

type LedgerElegivel = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string | null;
  pedido_id: string | null;
};

export async function processarDevolucaoLiberacaoAutomaticaCron(): Promise<{
  avaliados: number;
  liberados: number;
}> {
  const limite = new Date(Date.now() - PRAZO_HORAS * 60 * 60 * 1000).toISOString();

  const { data: elegiveis, error } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, org_id, seller_id, fornecedor_id, pedido_id")
    .eq("status", "EM_DEVOLUCAO")
    .lt("em_devolucao_desde", limite)
    .is("fornecedor_contestou_em", null)
    .limit(MAX_POR_RUN);

  if (error) throw new Error(error.message);

  const lista = (elegiveis ?? []) as LedgerElegivel[];
  let liberados = 0;

  for (const row of lista) {
    try {
      const { data: resultado, error: rpcErr } = await supabaseAdmin
        .rpc("fn_devolucao_liberar_automatico", { p_ledger_id: row.id })
        .single();
      if (rpcErr) {
        console.error(`[devolucao-liberacao-automatica] rpc falhou pra ledger ${row.id}:`, rpcErr.message);
        continue;
      }
      const ok = (resultado as { ok: boolean } | null)?.ok ?? false;
      if (!ok) continue;

      liberados += 1;

      await Promise.all([
        notifySellerPedidoAtencao({
          org_id: row.org_id,
          seller_id: row.seller_id,
          pedido_id: row.pedido_id,
          tipo: "devolucao_liberada_automatico_seller",
          motivo: "O fornecedor não respondeu em 48h sobre a devolução — o valor foi liberado automaticamente pro seu saldo.",
        }),
        row.fornecedor_id
          ? notifyFornecedorDevolucaoLiberadaAutomatico({
              org_id: row.org_id,
              fornecedor_id: row.fornecedor_id,
              ledger_id: row.id,
            })
          : Promise.resolve(),
      ]);
    } catch (e) {
      console.error(`[devolucao-liberacao-automatica] erro no ledger ${row.id}:`, e);
    }
  }

  return { avaliados: lista.length, liberados };
}
