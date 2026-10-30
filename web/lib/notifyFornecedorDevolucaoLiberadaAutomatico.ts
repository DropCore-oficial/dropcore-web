/**
 * Notifica o fornecedor quando o prazo de 48h venceu sem ele confirmar nem contestar, e o
 * sistema liberou o valor pro seller sozinho (ver devolucaoLiberacaoAutomatica.ts).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorDevolucaoLiberadaAutomatico(params: {
  org_id: string;
  fornecedor_id: string;
  ledger_id: string;
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
    tipo: "devolucao_liberada_automatico_fornecedor",
    titulo: "Prazo de devolução vencido",
    mensagem: "Você não confirmou nem contestou essa devolução em 48h — o valor foi liberado automaticamente pro seller.",
    metadata: { ledger_id: params.ledger_id },
  });
}
