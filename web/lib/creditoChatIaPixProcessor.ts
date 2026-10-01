/**
 * Pagamento PIX de crédito extra do chat do Tiago Silva (`external_reference`:
 * `chatia-{row.id}` em `seller_depositos_pix`, `referencia` = CREDITO_CHAT_IA). Não mexe em
 * saldo/ledger de pedido — só credita as 2 colunas de crédito extra em `sellers`, válidas
 * apenas no dia da compra (ver `gestorTiagoChatOrcamentoDia.ts`).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hojeBrtIso } from "./ai/gestorTiagoChatOrcamentoDia";

export const SELLER_DEPOSITO_REF_CREDITO_CHAT_IA = "CREDITO_CHAT_IA";

/** Margem de 100% (liberado = pago/2) vale pra qualquer valor dentro do intervalo —
 * decisão 2026-09-30, mesma regra do add-on mensal. Tela oferece atalhos de 10/20/25/50,
 * mas aceita qualquer valor digitado dentro do MIN/MAX. */
export const MIN_CREDITO_CHAT_IA_PAGO = 5;
export const MAX_CREDITO_CHAT_IA_PAGO = 200;

export function valorCreditoChatIaValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= MIN_CREDITO_CHAT_IA_PAGO && valor <= MAX_CREDITO_CHAT_IA_PAGO;
}

export async function processarCreditoChatIaAprovado(extRef: string): Promise<boolean> {
  const prefix = "chatia-";
  if (!extRef.trim().startsWith(prefix)) return false;

  const rowId = extRef.slice(prefix.length).trim();
  if (!rowId) return false;

  const { data: dep, error: fetchErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, seller_id, valor, status, referencia")
    .eq("id", rowId)
    .maybeSingle();

  if (fetchErr || !dep || dep.referencia !== SELLER_DEPOSITO_REF_CREDITO_CHAT_IA || dep.status !== "pendente") {
    return false;
  }

  const valorPago = Number(dep.valor);
  if (!valorCreditoChatIaValido(valorPago)) return false;
  const liberado = valorPago / 2;

  const now = new Date().toISOString();
  const hoje = hojeBrtIso();

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("id, user_id, gestor_mestre_chat_credito_extra_reais, gestor_mestre_chat_credito_extra_dia_ref")
    .eq("id", dep.seller_id)
    .maybeSingle();
  if (!sellerRow) return false;

  const creditoAtualValido = sellerRow.gestor_mestre_chat_credito_extra_dia_ref === hoje
    ? Number(sellerRow.gestor_mestre_chat_credito_extra_reais ?? 0)
    : 0;

  const { error: upSellerErr } = await supabaseAdmin
    .from("sellers")
    .update({
      gestor_mestre_chat_credito_extra_reais: creditoAtualValido + liberado,
      gestor_mestre_chat_credito_extra_dia_ref: hoje,
    })
    .eq("id", sellerRow.id);

  if (upSellerErr) {
    console.error("[creditoChatIaPixProcessor] creditar crédito extra:", upSellerErr.message);
    return false;
  }

  await supabaseAdmin
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", rowId)
    .eq("seller_id", dep.seller_id);

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(liberado);
  if (sellerRow.user_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: sellerRow.user_id,
      tipo: "chat_credito_extra_ativo",
      titulo: "Crédito extra do chat liberado",
      mensagem: `Pagamento confirmado. Você tem mais ${valorBRL} de uso liberado no chat do Tiago Silva hoje.`,
      metadata: { deposito_id: rowId },
    });
  }

  return true;
}
