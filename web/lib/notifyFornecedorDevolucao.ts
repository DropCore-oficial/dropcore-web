/**
 * Notifica o fornecedor quando o admin registra uma devolução (EM_DEVOLUCAO) — é o aviso de
 * que o prazo de 48h começou: ele precisa confirmar "chegou tudo certo" ou contestar em
 * /fornecedor/devolucoes, senão o sistema libera o valor pro seller sozinho quando vencer.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorDevolucao(params: {
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
    tipo: "devolucao_registrada_fornecedor",
    titulo: "Devolução aguardando sua confirmação",
    mensagem:
      "Um pedido está voltando pra você. Confirme o recebimento ou conteste em até 48h — se não responder, o valor é liberado automaticamente pro seller.",
    metadata: { ledger_id: params.ledger_id },
  });
}
