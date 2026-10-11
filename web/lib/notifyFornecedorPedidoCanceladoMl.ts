/**
 * Notifica o fornecedor (portal DropCore) quando o Mercado Livre cancela um pedido antes
 * da postagem (achado 2026-10-09, ver web/lib/cancelamentoMlReconciliacao.ts) — sem isso o
 * fornecedor só descobria entrando na tela de Pedidos e vendo o badge mudar sozinho. Nunca
 * menciona valor (nem `valor_fornecedor`) — é só aviso de status, sem dado financeiro novo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorPedidoCanceladoMl(params: {
  org_id: string;
  fornecedor_id: string;
  pedido_id: string;
}): Promise<void> {
  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .eq("fornecedor_id", params.fornecedor_id)
    .limit(1)
    .maybeSingle();

  const memberUserId = member?.user_id ?? null;
  if (!memberUserId) return;

  await supabaseAdmin.from("notifications").insert({
    user_id: memberUserId,
    tipo: "pedido_cancelado_ml",
    titulo: "Pedido cancelado pelo Mercado Livre",
    mensagem:
      "O Mercado Livre cancelou este pedido antes da postagem (etiqueta nunca liberada — geralmente nota fiscal não emitida a tempo pelo seller). Não é necessário separar nem despachar.",
    metadata: { pedido_id: params.pedido_id },
  });
}
