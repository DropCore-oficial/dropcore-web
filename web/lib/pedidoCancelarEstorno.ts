/**
 * Núcleo compartilhado de "cancelamento sem sync" — achado 2026-10-09: o marketplace cancela
 * o pedido depois de já importado/postado, e o DropCore nunca fica sabendo — pedido trava,
 * saldo do seller fica bloqueado pra sempre. A detecção do cancelamento fica em
 * cancelamentoMlReconciliacao.ts — essa função é só a parte compartilhada de EXECUTAR: chama
 * a RPC que cancela o pedido + estorna o ledger, e avisa seller/admin/fornecedor.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyAdminsPedidoCancelado } from "@/lib/notifyAdminsPedidoCancelado";
import { notifyFornecedorPedidoCancelado } from "@/lib/notifyFornecedorPedidoCancelado";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";

export type CancelarPedidoEEstornarResult = { cancelado: boolean; valor_estornado?: number };

/**
 * Chama a RPC `fn_pedido_cancelar_estorno` (SECURITY DEFINER, service_role only) e, se
 * cancelou de verdade (não era já cancelado/não-enviado), avisa seller/admin/fornecedor.
 * Idempotente — pode ser chamado mais de uma vez pro mesmo pedido (webhook + cron podem
 * concorrer) sem efeito duplicado, a RPC confere o status antes de agir.
 */
export async function cancelarPedidoEEstornar(params: {
  pedido_id: string;
  org_id: string;
  canal_label: string;
  motivo_tecnico: string;
  motivo_seller: string;
}): Promise<CancelarPedidoEEstornarResult> {
  const { data, error } = await supabaseAdmin
    .rpc("fn_pedido_cancelar_estorno", {
      p_pedido_id: params.pedido_id,
      p_org_id: params.org_id,
      p_motivo: params.motivo_tecnico,
    })
    .single();

  if (error) {
    console.error("[pedidoCancelarEstorno] rpc:", error.message);
    return { cancelado: false };
  }

  const resultado = data as {
    ok: boolean;
    already_cancelled: boolean;
    seller_id: string | null;
    fornecedor_id: string | null;
    valor_estornado: number;
  } | null;
  if (!resultado?.ok || resultado.already_cancelled || !resultado.seller_id) {
    return { cancelado: false };
  }

  const valorEstornado = Number(resultado.valor_estornado ?? 0);

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("nome")
    .eq("id", resultado.seller_id)
    .maybeSingle();

  await Promise.all([
    notifySellerPedidoAtencao({
      org_id: params.org_id,
      seller_id: resultado.seller_id,
      pedido_id: params.pedido_id,
      tipo: "pedido_cancelado_ml",
      motivo: `${params.motivo_seller} O saldo bloqueado de R$ ${valorEstornado.toFixed(2)} já foi devolvido ao seu saldo disponível.`,
    }),
    notifyAdminsPedidoCancelado({
      org_id: params.org_id,
      pedido_id: params.pedido_id,
      seller_nome: sellerRow?.nome ?? null,
      canal_label: params.canal_label,
      valor_estornado: valorEstornado,
    }),
    resultado.fornecedor_id
      ? notifyFornecedorPedidoCancelado({
          org_id: params.org_id,
          fornecedor_id: resultado.fornecedor_id,
          pedido_id: params.pedido_id,
          canal_label: params.canal_label,
        })
      : Promise.resolve(),
  ]);

  return { cancelado: true, valor_estornado: valorEstornado };
}
