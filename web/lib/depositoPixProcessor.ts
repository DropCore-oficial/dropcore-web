/**
 * Processa depósito PIX aprovado (usado por webhook e polling).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function processarDepositoAprovado(extRef: string): Promise<boolean> {
  if (!extRef.trim() || !extRef.startsWith("deposito-")) return false;

  const depositoId = extRef.slice("deposito-".length);
  const now = new Date().toISOString();

  /**
   * Reserva atômica: só um processo (webhook MP, polling sync, retry) pode passar.
   * Sem isto, webhook + sync a 10s viam ambos `pendente` e creditavam 2× o mesmo depósito.
   */
  const { data: claimedRows, error: claimErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", depositoId)
    .eq("status", "pendente")
    .select("id, org_id, seller_id, valor");

  if (claimErr || !claimedRows?.length) return false;
  const deposito = claimedRows[0];

  const valor = Number(deposito.valor);
  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id, nome")
    .eq("id", deposito.seller_id)
    .single();
  const sellerUserId = sellerRow?.user_id;
  const sellerNome = sellerRow?.nome ?? "Seller";

  let ledgerInserted = false;
  try {
    const { error: ledgerErr } = await supabaseAdmin.from("financial_ledger").insert({
      org_id: deposito.org_id,
      seller_id: deposito.seller_id,
      fornecedor_id: null,
      pedido_id: null,
      tipo: "CREDITO",
      valor_fornecedor: 0,
      valor_dropcore: valor,
      valor_total: valor,
      status: "LIBERADO",
      referencia: "PIX aprovado (Mercado Pago)",
    });
    if (ledgerErr) throw ledgerErr;
    ledgerInserted = true;

    /**
     * Não atualizar sellers.saldo_atual aqui: o trigger `tr_financial_ledger_sync_seller`
     * (financial-module-v2.sql) já recalcula saldo_atual + saldo_bloqueado a partir do ledger.
     * Somar `valor` de novo duplicava o crédito (ex.: PIX de 700 virava +1400 no saldo).
     */

    const { error: movErr } = await supabaseAdmin.from("seller_movimentacoes").insert({
      seller_id: deposito.seller_id,
      tipo: "credito",
      valor,
      motivo: "PIX",
      referencia: `Depósito PIX aprovado ${depositoId}`,
    });
    if (movErr) throw movErr;
  } catch (e: unknown) {
    if (!ledgerInserted) {
      await supabaseAdmin
        .from("seller_depositos_pix")
        .update({ status: "pendente", aprovado_em: null })
        .eq("id", depositoId)
        .eq("status", "aprovado");
    } else {
      console.error("[depositoPixProcessor] falha após lançar ledger — exige correção manual:", e);
    }
    return false;
  }

  if (sellerUserId) {
    await supabaseAdmin.from("notifications").insert({
      user_id: sellerUserId,
      tipo: "deposito_aprovado",
      titulo: "Depósito aprovado",
      mensagem: `Seu depósito de ${valorBRL} foi aprovado e já está disponível no saldo.`,
      metadata: { deposito_id: depositoId, valor },
    });
  }

  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", deposito.org_id)
    .in("role_base", ["owner", "admin"]);
  if (admins?.length) {
    const toInsert = admins
      .filter((a) => a.user_id && a.user_id !== sellerUserId)
      .map((a) => ({
        user_id: a.user_id,
        tipo: "deposito_entrou",
        titulo: "Novo depósito PIX",
        mensagem: `Depósito de ${valorBRL} de ${sellerNome} foi aprovado.`,
        metadata: { deposito_id: depositoId, valor, seller_id: deposito.seller_id },
      }));
    if (toInsert.length) {
      await supabaseAdmin.from("notifications").insert(toInsert);
    }
  }

  return true;
}
