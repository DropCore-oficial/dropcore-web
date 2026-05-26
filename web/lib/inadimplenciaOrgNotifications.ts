/**
 * Notifica admins da org sobre sellers/fornecedores inadimplentes (tipo mensalidade_inadimplentes_org).
 * Rodar em cron — não em GET de dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function syncInadimplentesOrgAdminNotifications(
  supabase: SupabaseClient,
  orgId: string,
  inadimplentes: { sellers: number; fornecedores: number }
): Promise<void> {
  const total = inadimplentes.sellers + inadimplentes.fornecedores;
  const { data: adminsInad } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .in("role_base", ["owner", "admin"]);

  const tipoInadOrg = "mensalidade_inadimplentes_org";

  if (total <= 0) {
    for (const a of adminsInad ?? []) {
      if (!a.user_id) continue;
      await supabase.from("notifications").delete().eq("user_id", a.user_id).eq("tipo", tipoInadOrg);
    }
    return;
  }

  const desde = new Date();
  desde.setHours(desde.getHours() - 24);
  const msg =
    inadimplentes.sellers > 0 && inadimplentes.fornecedores > 0
      ? `${inadimplentes.sellers} seller(s) e ${inadimplentes.fornecedores} fornecedor(es) inadimplentes. Verifique as mensalidades.`
      : inadimplentes.sellers > 0
        ? `${inadimplentes.sellers} seller(s) inadimplente(s). Verifique as mensalidades.`
        : `${inadimplentes.fornecedores} fornecedor(es) inadimplente(s). Verifique as mensalidades.`;

  for (const a of adminsInad ?? []) {
    if (!a.user_id) continue;
    const { data: jaExiste } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", a.user_id)
      .eq("tipo", tipoInadOrg)
      .gte("criado_em", desde.toISOString())
      .limit(1)
      .maybeSingle();
    if (!jaExiste) {
      await supabase.from("notifications").insert({
        user_id: a.user_id,
        tipo: tipoInadOrg,
        titulo: "Mensalidades vencidas",
        mensagem: msg,
        metadata: {},
      });
    }
  }
}
