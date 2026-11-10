/**
 * Notifica o fornecedor quando o Mercado Livre confirma (via rastreio real,
 * `/post-purchase/v2/claims/{id}/returns`) que a peça da devolução chegou fisicamente no
 * endereço dele — é AQUI que o prazo de confirmação de verdade começa (ver
 * `verificarEntregasFisicasDevolucao.ts`), não no registro inicial da devolução.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyFornecedorEntregaDevolucaoConfirmada(params: {
  org_id: string;
  fornecedor_id: string;
  ledger_id: string;
  prazoHoras: number;
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
    tipo: "devolucao_entrega_confirmada_fornecedor",
    titulo: "Devolução chegou no seu endereço — confirme",
    mensagem: `O Mercado Livre confirmou que a peça da devolução já foi entregue no seu endereço. Confira e confirme o recebimento (ou conteste, se vier errada/com defeito) em até ${params.prazoHoras}h — se não responder, o valor é liberado automaticamente pro seller.`,
    metadata: { ledger_id: params.ledger_id },
  });
}
