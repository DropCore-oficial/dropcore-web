/**
 * Processa depósito PIX aprovado (usado por webhook e polling).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function processarDepositoAprovado(extRef: string): Promise<boolean> {
  if (!extRef.trim() || !extRef.startsWith("deposito-")) return false;

  const depositoId = extRef.slice("deposito-".length);
  const { data: deposito, error: fetchErr } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, org_id, seller_id, valor, status")
    .eq("id", depositoId)
    .single();

  if (fetchErr || !deposito || deposito.status !== "pendente") return false;

  const valor = Number(deposito.valor);
  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  const now = new Date().toISOString();

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("user_id, nome")
    .eq("id", deposito.seller_id)
    .single();
  const sellerUserId = sellerRow?.user_id;
  const sellerNome = sellerRow?.nome ?? "Seller";

  await supabaseAdmin.from("financial_ledger").insert({
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

  const { data: seller } = await supabaseAdmin.from("sellers").select("saldo_atual").eq("id", deposito.seller_id).single();
  const novoSaldo = (Number(seller?.saldo_atual) || 0) + valor;
  await supabaseAdmin.from("sellers").update({ saldo_atual: novoSaldo, atualizado_em: now }).eq("id", deposito.seller_id);

  await supabaseAdmin.from("seller_movimentacoes").insert({
    seller_id: deposito.seller_id,
    tipo: "credito",
    valor,
    motivo: "PIX",
    referencia: `Depósito PIX aprovado ${depositoId}`,
  });

  await supabaseAdmin
    .from("seller_depositos_pix")
    .update({ status: "aprovado", aprovado_em: now })
    .eq("id", depositoId)
    .eq("org_id", deposito.org_id);

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
