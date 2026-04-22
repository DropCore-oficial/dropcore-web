import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SellerInviteRow = {
  id: string;
  org_id: string;
  seller_id: string;
  usado: boolean;
  expira_em: string;
};

export async function resolveSellerInvite(
  token: string
): Promise<{ error: string | null; invite: SellerInviteRow | null }> {
  const { data, error } = await supabaseAdmin
    .from("seller_invites")
    .select("id, org_id, seller_id, usado, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { error: "Convite não encontrado.", invite: null };
  if (data.usado) return { error: "Este convite já foi utilizado.", invite: null };
  if (new Date(data.expira_em) < new Date()) return { error: "Este convite expirou.", invite: null };
  return { error: null, invite: data as SellerInviteRow };
}
