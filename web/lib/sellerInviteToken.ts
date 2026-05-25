import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SellerInviteRow = {
  id: string;
  org_id: string;
  seller_id: string;
  usado: boolean;
  expira_em: string;
  portal_trial_dias: number;
};

export async function fetchSellerInviteByToken(
  token: string
): Promise<{ error: string | null; invite: SellerInviteRow | null }> {
  const { data, error } = await supabaseAdmin
    .from("seller_invites")
    .select("id, org_id, seller_id, usado, expira_em, portal_trial_dias")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { error: "Convite não encontrado.", invite: null };

  const portal_trial_dias =
    typeof (data as { portal_trial_dias?: unknown }).portal_trial_dias === "number" &&
    Number.isFinite((data as { portal_trial_dias: number }).portal_trial_dias)
      ? Math.min(365, Math.max(0, Math.floor((data as { portal_trial_dias: number }).portal_trial_dias)))
      : 7;

  return {
    error: null,
    invite: {
      id: data.id,
      org_id: data.org_id,
      seller_id: data.seller_id,
      usado: data.usado,
      expira_em: data.expira_em,
      portal_trial_dias,
    },
  };
}

export async function resolveSellerInvite(
  token: string
): Promise<{ error: string | null; invite: SellerInviteRow | null }> {
  const { error, invite } = await fetchSellerInviteByToken(token);
  if (error || !invite) return { error, invite: null };
  if (invite.usado) return { error: "Este convite já foi utilizado.", invite: null };
  if (new Date(invite.expira_em) < new Date()) return { error: "Este convite expirou.", invite: null };
  return { error: null, invite };
}

/** Convite consumido com seller já vinculado a um usuário Auth (cadastro concluído). */
export async function resolveSellerInviteConsumedWithAccount(
  token: string
): Promise<{ seller_nome: string; seller_id: string } | null> {
  const { error, invite } = await fetchSellerInviteByToken(token);
  if (error || !invite || !invite.usado) return null;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, nome, user_id")
    .eq("id", invite.seller_id)
    .maybeSingle();

  if (!seller?.user_id) return null;
  return { seller_nome: seller.nome ?? "—", seller_id: seller.id };
}
