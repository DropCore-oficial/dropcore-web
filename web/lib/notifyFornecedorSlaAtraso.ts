/**
 * Notifica o fornecedor (portal DropCore) quando o prazo de despacho do marketplace já
 * passou e o pedido ainda não foi postado — SLA de postagem (Fase 2), v1 só avisa, sem
 * penalidade financeira. Mesmo padrão de `notifyFornecedorPedidoParaPostar.ts`.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorSlaAtraso(params: {
  org_id: string;
  fornecedor_id: string;
  pedido_id: string;
  canal_venda: string;
}): Promise<void> {
  let memberUserId: string | null = null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .eq("fornecedor_id", params.fornecedor_id)
    .limit(1)
    .maybeSingle();

  memberUserId = member?.user_id ?? null;

  if (!memberUserId) {
    const { data: fallback } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("fornecedor_id", params.fornecedor_id)
      .limit(1)
      .maybeSingle();
    memberUserId = fallback?.user_id ?? null;
  }

  if (!memberUserId) return;

  await supabaseAdmin.from("notifications").insert({
    user_id: memberUserId,
    tipo: "pedido_sla_atrasado",
    titulo: "Prazo de despacho vencido",
    mensagem: `Um pedido (${params.canal_venda}) passou do prazo de despacho do marketplace e ainda está aguardando postagem. Poste o quanto antes.`,
    metadata: { pedido_id: params.pedido_id },
  });
}
