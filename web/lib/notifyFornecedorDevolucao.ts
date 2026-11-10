/**
 * Notifica o fornecedor quando o admin/sistema registra uma devolução (EM_DEVOLUCAO) — só
 * avisa que o valor está travado esperando a peça voltar fisicamente. O prazo pra confirmar
 * de verdade só começa quando o Mercado Livre confirma a entrega física (ver
 * `notifyFornecedorEntregaDevolucaoConfirmada`), não a partir deste aviso — achado 2026-11-10:
 * a mensagem antiga prometia "48h ou libera sozinho" contando daqui, mas a liberação
 * automática ficou desligada meses (desde 2026-10-30) porque devolução física demora 10+
 * dias pra chegar; usar o sinal real do ML em vez de um timer cego evita prometer prazo
 * errado de novo.
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
    titulo: "Devolução a caminho de volta",
    mensagem:
      "Um pedido está voltando pra você. O valor já está travado. Assim que a peça chegar fisicamente no seu endereço (confirmado pelo rastreio do Mercado Livre), você vai ter um novo aviso com o prazo pra confirmar o recebimento.",
    metadata: { ledger_id: params.ledger_id },
  });
}
