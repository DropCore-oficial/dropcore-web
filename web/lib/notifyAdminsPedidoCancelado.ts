import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "pedido_cancelado_erp" as const;

/**
 * Notifica owners/admins da org quando o marketplace/ERP cancela um pedido sem o DropCore
 * nunca ficar sabendo (achado 2026-10-09 pro ML, generalizado 2026-10-12 pra Olist/Bling —
 * mesmo buraco, canal diferente). O seller já é avisado via notifySellerPedidoAtencao, mas
 * o estorno de saldo é um evento financeiro real que a org também precisa enxergar, não só
 * descobrir pela tela de Pedidos.
 */
export async function notifyAdminsPedidoCancelado(params: {
  org_id: string;
  pedido_id: string;
  seller_nome?: string | null;
  canal_label: string;
  valor_estornado: number;
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    params.valor_estornado
  );

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: `Pedido cancelado pelo ${params.canal_label}`,
      mensagem: `O ${params.canal_label} cancelou o pedido ${params.pedido_id}${params.seller_nome ? ` (seller ${params.seller_nome})` : ""} depois de já postado/bloqueado. ${valorBRL} foram estornados automaticamente pro saldo do seller.`,
      metadata: { pedido_id: params.pedido_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_PEDIDO_CANCELADO_ERP };
