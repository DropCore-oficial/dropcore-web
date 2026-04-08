import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remove fornecedor e dados ligados na org (ordem compatível com FKs).
 * Uso restrito a admin/owner via API.
 */
export async function deleteFornecedorCascade(
  sb: SupabaseClient,
  orgId: string,
  fornecedorId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: forn, error: fornErr } = await sb
    .from("fornecedores")
    .select("id")
    .eq("id", fornecedorId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (fornErr) return { ok: false, message: fornErr.message };
  if (!forn) return { ok: false, message: "Fornecedor não encontrado." };

  const { data: pedRows, error: pedSelErr } = await sb
    .from("pedidos")
    .select("id")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);

  if (pedSelErr) return { ok: false, message: pedSelErr.message };

  const pedidoIds = (pedRows ?? []).map((p: { id: string }) => p.id).filter(Boolean);

  if (pedidoIds.length > 0) {
    const { error: evErr } = await sb.from("pedido_eventos").delete().in("pedido_id", pedidoIds);
    if (evErr && !isMissingRelation(evErr)) return { ok: false, message: evErr.message };

    const { error: itErr } = await sb.from("pedido_itens").delete().in("pedido_id", pedidoIds);
    if (itErr) return { ok: false, message: itErr.message };
  }

  const { error: pedDelErr } = await sb
    .from("pedidos")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (pedDelErr) return { ok: false, message: pedDelErr.message };

  const { error: debErr } = await sb
    .from("financial_debito_descontar")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (debErr && !isMissingRelation(debErr)) return { ok: false, message: debErr.message };

  const { error: ledErr } = await sb
    .from("financial_ledger")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (ledErr) return { ok: false, message: ledErr.message };

  const { error: repErr } = await sb
    .from("financial_repasse_fornecedor")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (repErr && !isMissingRelation(repErr)) return { ok: false, message: repErr.message };

  const { error: menErr } = await sb
    .from("financial_mensalidades")
    .delete()
    .eq("org_id", orgId)
    .eq("tipo", "fornecedor")
    .eq("entidade_id", fornecedorId);
  if (menErr && !isMissingRelation(menErr)) return { ok: false, message: menErr.message };

  const { error: invErr } = await sb.from("fornecedor_invites").delete().eq("fornecedor_id", fornecedorId);
  if (invErr && !isMissingRelation(invErr)) return { ok: false, message: invErr.message };

  const { error: altErr } = await sb
    .from("sku_alteracoes_pendentes")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (altErr && !isMissingRelation(altErr)) return { ok: false, message: altErr.message };

  const { error: tabErr } = await sb
    .from("produto_tabela_medidas")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (tabErr && !isMissingRelation(tabErr)) return { ok: false, message: tabErr.message };

  const { error: skuErr } = await sb
    .from("skus")
    .delete()
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (skuErr) return { ok: false, message: skuErr.message };

  const { error: sellErr } = await sb
    .from("sellers")
    .update({ fornecedor_id: null })
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (sellErr) return { ok: false, message: sellErr.message };

  const { error: memErr } = await sb
    .from("org_members")
    .update({ fornecedor_id: null })
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId);
  if (memErr) return { ok: false, message: memErr.message };

  const { error: delFornErr } = await sb.from("fornecedores").delete().eq("id", fornecedorId).eq("org_id", orgId);
  if (delFornErr) return { ok: false, message: delFornErr.message };

  return { ok: true };
}

function isMissingRelation(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || err.code === "PGRST116";
}
