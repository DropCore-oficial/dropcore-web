import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Convite de acesso (seller/fornecedor) que expirou sem nunca ter sido aceito: a entidade
 * nunca criou login, então nunca deveria ter entrado na cobrança normal. Marca
 * `status: "convite_expirado"` (sai do filtro "ativo" do gerador de mensalidade), cancela
 * qualquer mensalidade pendente/inadimplente gerada nesse meio tempo, e apaga o convite vencido
 * (não guardamos e-mail antes do aceite, então não há dado pessoal pra limpar além disso).
 */
export async function expirarConvitesNaoAceitos(sb: SupabaseClient, orgId: string): Promise<number> {
  let n = 0;

  const { data: sellerInvites } = await sb
    .from("seller_invites")
    .select("id, seller_id")
    .eq("org_id", orgId)
    .eq("usado", false)
    .lt("expira_em", new Date().toISOString());

  for (const inv of sellerInvites ?? []) {
    const { data: seller } = await sb
      .from("sellers")
      .select("user_id, status")
      .eq("id", inv.seller_id)
      .maybeSingle();
    if (!seller?.user_id && seller?.status === "ativo") {
      await sb.from("sellers").update({ status: "convite_expirado" }).eq("id", inv.seller_id);
      await sb
        .from("financial_mensalidades")
        .update({ status: "cancelado" })
        .eq("tipo", "seller")
        .eq("entidade_id", inv.seller_id)
        .in("status", ["pendente", "inadimplente"]);
      n++;
    }
    await sb.from("seller_invites").delete().eq("id", inv.id);
  }

  const { data: fornInvites } = await sb
    .from("fornecedor_invites")
    .select("id, fornecedor_id")
    .eq("org_id", orgId)
    .eq("usado", false)
    .lt("expira_em", new Date().toISOString());

  for (const inv of fornInvites ?? []) {
    const { data: membro } = await sb
      .from("org_members")
      .select("id")
      .eq("org_id", orgId)
      .eq("fornecedor_id", inv.fornecedor_id)
      .limit(1)
      .maybeSingle();

    if (!membro) {
      const { data: forn } = await sb
        .from("fornecedores")
        .select("status")
        .eq("id", inv.fornecedor_id)
        .maybeSingle();
      if (forn?.status === "ativo") {
        await sb.from("fornecedores").update({ status: "convite_expirado" }).eq("id", inv.fornecedor_id);
        await sb
          .from("financial_mensalidades")
          .update({ status: "cancelado" })
          .eq("tipo", "fornecedor")
          .eq("entidade_id", inv.fornecedor_id)
          .in("status", ["pendente", "inadimplente"]);
        n++;
      }
    }
    await sb.from("fornecedor_invites").delete().eq("id", inv.id);
  }

  return n;
}
