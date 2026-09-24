import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "sla_atraso_admin" as const;

/**
 * Notifica owners/admins da org quando um pedido passa do prazo de despacho do
 * marketplace (SLA de postagem, Fase 2) — visibilidade pra org, base pra decidir
 * penalidade real mais adiante (v1 só notifica, sem desconto financeiro ainda).
 */
export async function notifyAdminsSlaAtraso(params: {
  org_id: string;
  pedido_id: string;
  canal_venda: string;
  fornecedor_nome?: string | null;
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .in("role_base", ["owner", "admin"]);

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: "Pedido atrasado no prazo de despacho",
      mensagem: `Pedido ${params.pedido_id} (${params.canal_venda})${params.fornecedor_nome ? ` — fornecedor ${params.fornecedor_nome}` : ""} passou do prazo de despacho do marketplace e ainda está aguardando postagem.`,
      metadata: { pedido_id: params.pedido_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_SLA_ATRASO_ADMIN };
