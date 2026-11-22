/**
 * Notifica o fornecedor (portal DropCore) quando o marketplace cancela um pedido depois de
 * já postado/bloqueado (achado 2026-10-09). Sem isso, o fornecedor só descobria entrando na
 * tela de Pedidos e vendo o badge mudar sozinho. Nunca menciona valor (nem
 * `valor_fornecedor`) — é só aviso de status, sem dado financeiro novo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorPedidoCancelado(params: {
  org_id: string;
  fornecedor_id: string;
  pedido_id: string;
  canal_label: string;
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
    tipo: "pedido_cancelado_erp",
    titulo: `Pedido cancelado pelo ${params.canal_label}`,
    mensagem: `O ${params.canal_label} cancelou este pedido depois de já postado/bloqueado. Não é necessário separar nem despachar.`,
    metadata: { pedido_id: params.pedido_id },
  });
}
