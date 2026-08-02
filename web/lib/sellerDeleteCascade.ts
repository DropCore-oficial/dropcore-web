import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelation(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || err.code === "PGRST116";
}

/**
 * Remove seller e dados ligados na org (ordem compatível com FKs) — mesmo molde de
 * `deleteFornecedorCascade`. Seller ativo com pedidos não pode ser excluído (deve virar
 * "inativo" antes); inativo com pedidos cascade-deleta pedidos e itens.
 * Antes desta função, o DELETE de seller só apagava `seller_movimentacoes` + pedidos —
 * `financial_ledger`, `estoque_reservas`, `seller_credit_lots`, `seller_depositos_pix` e
 * `erp_event_logs` têm FK `RESTRICT` pra sellers e travavam a exclusão sem mensagem clara;
 * `financial_mensalidades` não tem FK (entidade_id é polimórfico) e ficava órfã, contando
 * pra sempre como "inadimplente" numa entidade que não existe mais.
 */
export async function deleteSellerCascade(
  sb: SupabaseClient,
  orgId: string,
  sellerId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: seller, error: sellerErr } = await sb
    .from("sellers")
    .select("id, status")
    .eq("id", sellerId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (sellerErr) return { ok: false, message: sellerErr.message };
  if (!seller) return { ok: false, message: "Seller não encontrado." };

  const estaInativo = seller.status === "inativo";

  const { data: pedRows, error: pedSelErr } = await sb
    .from("pedidos")
    .select("id")
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (pedSelErr) return { ok: false, message: pedSelErr.message };

  const pedidoIds = (pedRows ?? []).map((p: { id: string }) => p.id).filter(Boolean);

  if (!estaInativo && pedidoIds.length > 0) {
    return {
      ok: false,
      message: "Não é possível excluir este seller porque existem pedidos associados a ele. Marque como 'inativo' em vez de excluir.",
    };
  }

  if (pedidoIds.length > 0) {
    const { error: itErr } = await sb.from("pedido_itens").delete().in("pedido_id", pedidoIds);
    if (itErr && !isMissingRelation(itErr)) return { ok: false, message: itErr.message };

    const { error: evErr } = await sb.from("pedido_eventos").delete().in("pedido_id", pedidoIds);
    if (evErr && !isMissingRelation(evErr)) return { ok: false, message: evErr.message };

    const { error: pedDelErr } = await sb
      .from("pedidos")
      .delete()
      .eq("org_id", orgId)
      .eq("seller_id", sellerId);
    if (pedDelErr) return { ok: false, message: pedDelErr.message };
  }

  const { error: ledErr } = await sb
    .from("financial_ledger")
    .delete()
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (ledErr) return { ok: false, message: ledErr.message };

  const { error: resErr } = await sb
    .from("estoque_reservas")
    .delete()
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (resErr && !isMissingRelation(resErr)) return { ok: false, message: resErr.message };

  const { error: creditErr } = await sb
    .from("seller_credit_lots")
    .delete()
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (creditErr && !isMissingRelation(creditErr)) return { ok: false, message: creditErr.message };

  const { error: pixErr } = await sb
    .from("seller_depositos_pix")
    .delete()
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (pixErr && !isMissingRelation(pixErr)) return { ok: false, message: pixErr.message };

  const { error: erpLogErr } = await sb
    .from("erp_event_logs")
    .delete()
    .eq("org_id", orgId)
    .eq("seller_id", sellerId);
  if (erpLogErr && !isMissingRelation(erpLogErr)) return { ok: false, message: erpLogErr.message };

  const { error: menErr } = await sb
    .from("financial_mensalidades")
    .delete()
    .eq("org_id", orgId)
    .eq("tipo", "seller")
    .eq("entidade_id", sellerId);
  if (menErr && !isMissingRelation(menErr)) return { ok: false, message: menErr.message };

  const { error: movErr } = await sb.from("seller_movimentacoes").delete().eq("seller_id", sellerId);
  if (movErr && !isMissingRelation(movErr)) return { ok: false, message: movErr.message };

  const { error: delSellerErr } = await sb.from("sellers").delete().eq("id", sellerId).eq("org_id", orgId);
  if (delSellerErr) return { ok: false, message: delSellerErr.message };

  return { ok: true };
}
