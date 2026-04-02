/**
 * Marca mensalidade como paga (usado por webhook e sync).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function processarMensalidadePaga(mensalidadeId: string): Promise<boolean> {
  if (!mensalidadeId?.trim()) return false;

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("id, tipo, entidade_id, org_id, valor")
    .eq("id", mensalidadeId)
    .in("status", ["pendente", "inadimplente"])
    .maybeSingle();

  if (fetchErr || !row) return false;

  const now = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .update({ status: "pago", pago_em: now })
    .eq("id", mensalidadeId)
    .in("status", ["pendente", "inadimplente"]);

  if (updateErr) {
    console.error("[mensalidadePixProcessor] Erro ao marcar mensalidade:", updateErr.message);
    return false;
  }

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.valor ?? 0));

  // Notificação para fornecedor quando mensalidade paga
  if (row.tipo === "fornecedor") {
    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", row.org_id)
      .eq("fornecedor_id", row.entidade_id)
      .limit(1)
      .maybeSingle();
    if (member?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: member.user_id,
        tipo: "mensalidade_paga",
        titulo: "Mensalidade paga",
        mensagem: `Sua mensalidade de ${valorBRL} foi confirmada. O acesso está regularizado.`,
        metadata: { mensalidade_id: row.id },
      });
    }
  }

  // Notificação para admins (DropCore): seller/fornecedor pagou a mensalidade
  let nomeEntidade = "";
  if (row.tipo === "seller") {
    const { data: s } = await supabaseAdmin.from("sellers").select("nome").eq("id", row.entidade_id).maybeSingle();
    nomeEntidade = (s?.nome as string) ?? "Seller";
  } else {
    const { data: f } = await supabaseAdmin.from("fornecedores").select("nome").eq("id", row.entidade_id).maybeSingle();
    nomeEntidade = (f?.nome as string) ?? "Fornecedor";
  }
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", row.org_id)
    .in("role_base", ["owner", "admin"]);
  const tipoLabel = row.tipo === "seller" ? "Seller" : "Fornecedor";
  const msg = `${tipoLabel} ${nomeEntidade} pagou a mensalidade de ${valorBRL}.`;
  for (const a of admins ?? []) {
    if (!a.user_id) continue;
    await supabaseAdmin.from("notifications").insert({
      user_id: a.user_id,
      tipo: "mensalidade_paga_admin",
      titulo: "Mensalidade paga",
      mensagem: msg,
      metadata: { mensalidade_id: row.id },
    });
  }

  return true;
}
