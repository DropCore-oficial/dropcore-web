/**
 * Marca mensalidade como paga (usado por webhook e sync).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buscarPagamentoMpAprovado,
  pagoEmFromMpPayment,
  valorLiquidoRecebidoMp,
} from "@/lib/mercadoPagoValorRecebido";

export async function processarMensalidadePaga(
  mensalidadeId: string,
  mpPaymentId?: string | null
): Promise<boolean> {
  if (!mensalidadeId?.trim()) return false;

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("id, tipo, entidade_id, org_id, valor, mp_payment_id")
    .eq("id", mensalidadeId)
    .in("status", ["pendente", "inadimplente"])
    .maybeSingle();

  if (fetchErr || !row) return false;

  const mpId = (mpPaymentId?.trim() || (row as { mp_payment_id?: string | null }).mp_payment_id?.trim()) || null;
  let valorLiquidoMp: number | null = null;
  let pagoEm = new Date().toISOString();

  if (mpId) {
    const payment = await buscarPagamentoMpAprovado(mpId);
    if (payment) {
      valorLiquidoMp = valorLiquidoRecebidoMp(payment);
      pagoEm = pagoEmFromMpPayment(payment) ?? pagoEm;
    }
  }

  const patch: Record<string, unknown> = {
    status: "pago",
    pago_em: pagoEm,
  };
  if (mpId) patch.mp_payment_id = mpId;
  if (valorLiquidoMp != null && Number.isFinite(valorLiquidoMp)) {
    patch.valor_liquido_mp = valorLiquidoMp;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .update(patch)
    .eq("id", mensalidadeId)
    .in("status", ["pendente", "inadimplente"]);

  if (updateErr) {
    console.error("[mensalidadePixProcessor] Erro ao marcar mensalidade:", updateErr.message);
    return false;
  }

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(row.valor ?? 0)
  );

  // Notificação para quem pagou (seller ou fornecedor)
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
        tipo: "mensalidade_paga_fornecedor",
        titulo: "Mensalidade paga",
        mensagem: `Sua mensalidade de ${valorBRL} foi confirmada. O acesso está regularizado.`,
        metadata: { mensalidade_id: row.id, entidade_tipo: "fornecedor" },
      });
    }
  } else if (row.tipo === "seller") {
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("user_id")
      .eq("id", row.entidade_id)
      .maybeSingle();
    if (seller?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: seller.user_id,
        tipo: "mensalidade_paga_seller",
        titulo: "Mensalidade paga",
        mensagem: `Sua mensalidade de ${valorBRL} foi confirmada. O acesso está regularizado.`,
        metadata: { mensalidade_id: row.id, entidade_tipo: "seller" },
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
