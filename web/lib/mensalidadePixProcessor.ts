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

  const now = new Date().toISOString();

  /**
   * Reserva atômica: só um processo (webhook MP, sync) marca como pago — mesmo padrão de
   * depositoPixProcessor.ts. Antes, SELECT e UPDATE eram passos separados: webhook + sync a
   * poucos segundos de distância viam ambos pendente e disparavam a notificação de
   * "mensalidade paga" 2x (achado real 2026-10-11).
   */
  const { data: row, error: claimErr } = await supabaseAdmin
    .from("financial_mensalidades")
    .update({ status: "pago", pago_em: now })
    .eq("id", mensalidadeId)
    .in("status", ["pendente", "inadimplente"])
    .select("id, tipo, entidade_id, org_id, valor, mp_payment_id")
    .maybeSingle();

  if (claimErr || !row) return false;

  const mpId = (mpPaymentId?.trim() || (row as { mp_payment_id?: string | null }).mp_payment_id?.trim()) || null;
  if (mpId) {
    const payment = await buscarPagamentoMpAprovado(mpId);
    if (payment) {
      const valorLiquidoMp = valorLiquidoRecebidoMp(payment);
      const patch: Record<string, unknown> = {
        mp_payment_id: mpId,
        pago_em: pagoEmFromMpPayment(payment) ?? now,
      };
      if (Number.isFinite(valorLiquidoMp)) patch.valor_liquido_mp = valorLiquidoMp;
      await supabaseAdmin.from("financial_mensalidades").update(patch).eq("id", mensalidadeId);
    }
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
