/**
 * Avisa o fornecedor sobre débito de devolução pós-repasse — em dois momentos distintos,
 * pra ele nunca ficar surpreso com "por que recebi menos": (1) quando o débito é registrado
 * (ainda vai ser descontado no próximo ciclo) e (2) quando é efetivamente descontado no
 * fechamento do repasse semanal. Sempre amarrado ao pedido original, nunca só um valor solto.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function resolverUserId(orgId: string, fornecedorId: string): Promise<string | null> {
  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId)
    .limit(1)
    .maybeSingle();
  return member?.user_id ?? null;
}

export async function notifyFornecedorDebitoDevolucaoRegistrado(params: {
  org_id: string;
  fornecedor_id: string;
  pedido_id: string | null;
  marketplace_numero: string | null;
  valor_fornecedor: number;
  ciclo_a_descontar: string;
}): Promise<void> {
  const userId = await resolverUserId(params.org_id, params.fornecedor_id);
  if (!userId) return;

  const pedidoRef = params.marketplace_numero ? ` (pedido #${params.marketplace_numero})` : "";
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "debito_devolucao_pos_repasse_registrado",
    titulo: "Devolução confirmada após o repasse",
    mensagem: `Uma devolução${pedidoRef} de R$ ${params.valor_fornecedor.toFixed(2)} foi confirmada depois do seu repasse já ter saído. Esse valor será descontado automaticamente no repasse do ciclo ${params.ciclo_a_descontar}.`,
    metadata: { pedido_id: params.pedido_id, ciclo_a_descontar: params.ciclo_a_descontar },
  });
}

export async function notifyFornecedorDebitoDevolucaoDescontado(params: {
  org_id: string;
  fornecedor_id: string;
  ciclo_repasse: string;
  itens: Array<{ pedido_id: string | null; marketplace_numero: string | null; valor_fornecedor: number }>;
}): Promise<void> {
  if (params.itens.length === 0) return;
  const userId = await resolverUserId(params.org_id, params.fornecedor_id);
  if (!userId) return;

  const total = params.itens.reduce((s, i) => s + i.valor_fornecedor, 0);
  const lista = params.itens
    .map((i) => `pedido #${i.marketplace_numero ?? "—"} (R$ ${i.valor_fornecedor.toFixed(2)})`)
    .join(", ");

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    tipo: "debito_devolucao_pos_repasse_descontado",
    titulo: "Desconto por devolução no seu repasse",
    mensagem: `Do seu repasse do ciclo ${params.ciclo_repasse}, foi descontado R$ ${total.toFixed(2)} referente a devolução confirmada: ${lista}.`,
    metadata: { ciclo_repasse: params.ciclo_repasse, itens: params.itens },
  });
}
