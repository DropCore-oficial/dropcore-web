/**
 * Notifica admins da org sobre convites de seller/fornecedor que ainda não foram aceitos
 * e vencem nas próximas 48h — chance de reenviar/cutucar antes do convite expirar e a
 * entidade cair em `convite_expirado` (ver expirarConvitesNaoAceitos.ts).
 * Rodar em cron — não em GET de dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const JANELA_HORAS = 48;
const TIPO = "convite_expirando_org";

export async function syncConvitesExpirandoOrgAdminNotifications(
  supabase: SupabaseClient,
  orgId: string
): Promise<void> {
  const agora = new Date();
  const limite = new Date(agora.getTime() + JANELA_HORAS * 60 * 60 * 1000);

  const [{ data: sellerInvites }, { data: fornInvites }] = await Promise.all([
    supabase
      .from("seller_invites")
      .select("seller_id")
      .eq("org_id", orgId)
      .eq("usado", false)
      .gte("expira_em", agora.toISOString())
      .lt("expira_em", limite.toISOString()),
    supabase
      .from("fornecedor_invites")
      .select("fornecedor_id")
      .eq("org_id", orgId)
      .eq("usado", false)
      .gte("expira_em", agora.toISOString())
      .lt("expira_em", limite.toISOString()),
  ]);

  const { data: adminsOrg } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .in("role_base", ["owner", "admin"]);

  const nSellers = sellerInvites?.length ?? 0;
  const nForn = fornInvites?.length ?? 0;
  const total = nSellers + nForn;

  if (total <= 0) {
    for (const a of adminsOrg ?? []) {
      if (!a.user_id) continue;
      await supabase.from("notifications").delete().eq("user_id", a.user_id).eq("tipo", TIPO);
    }
    return;
  }

  const nomes: string[] = [];
  if (sellerInvites?.length) {
    const { data: sellers } = await supabase
      .from("sellers")
      .select("nome")
      .in("id", sellerInvites.map((i: { seller_id: string }) => i.seller_id));
    for (const s of sellers ?? []) nomes.push(s.nome);
  }
  if (fornInvites?.length) {
    const { data: forns } = await supabase
      .from("fornecedores")
      .select("nome")
      .in("id", fornInvites.map((i: { fornecedor_id: string }) => i.fornecedor_id));
    for (const f of forns ?? []) nomes.push(f.nome);
  }

  const msg =
    total === 1
      ? `Convite de ${nomes[0] ?? "1 entidade"} vence em até 48h e ainda não foi aceito.`
      : `${total} convites vencem em até 48h e ainda não foram aceitos: ${nomes.slice(0, 3).join(", ")}${nomes.length > 3 ? "..." : ""}.`;

  const desde = new Date();
  desde.setHours(desde.getHours() - 24);

  for (const a of adminsOrg ?? []) {
    if (!a.user_id) continue;
    const { data: jaExiste } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", a.user_id)
      .eq("tipo", TIPO)
      .gte("criado_em", desde.toISOString())
      .limit(1)
      .maybeSingle();
    if (!jaExiste) {
      await supabase.from("notifications").insert({
        user_id: a.user_id,
        tipo: TIPO,
        titulo: "Convite prestes a vencer",
        mensagem: msg,
        metadata: { tem_seller: nSellers > 0, tem_fornecedor: nForn > 0 },
      });
    }
  }
}
