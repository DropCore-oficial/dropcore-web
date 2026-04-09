import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Remove notificações mensalidade_vencida / mensalidade_vencendo quando já não há
 * mensalidades pendentes nesse estado (evita alertas antigos na UI).
 */
export async function syncMensalidadeNotifications(userId: string): Promise<void> {
  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userId)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  let orgId: string | null = null;
  let tipoEntidade: "fornecedor" | "seller" | null = null;
  let entidadeId: string | null = null;

  if (member?.fornecedor_id) {
    orgId = member.org_id;
    tipoEntidade = "fornecedor";
    entidadeId = member.fornecedor_id;
  } else {
    const { data: seller } = await supabaseAdmin.from("sellers").select("id, org_id").eq("user_id", userId).maybeSingle();
    if (seller) {
      orgId = seller.org_id;
      tipoEntidade = "seller";
      entidadeId = seller.id;
    }
  }

  if (!orgId || !tipoEntidade || !entidadeId) return;

  const { data: rows } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("vencimento_em")
    .eq("org_id", orgId)
    .eq("tipo", tipoEntidade)
    .eq("entidade_id", entidadeId)
    .in("status", ["pendente", "inadimplente"]);

  const hoje = new Date().toISOString().slice(0, 10);
  const em3Dias = new Date();
  em3Dias.setDate(em3Dias.getDate() + 3);
  const em3DiasStr = em3Dias.toISOString().slice(0, 10);

  const items = (rows ?? []).map((r) => ({
    vencimento_em: r.vencimento_em as string | null,
    vencido: r.vencimento_em ? r.vencimento_em < hoje : false,
  }));

  const temVencidas = items.some((i) => i.vencido);
  const vencendoEm3Dias = items.some(
    (i) => i.vencimento_em && i.vencimento_em >= hoje && i.vencimento_em <= em3DiasStr
  );

  if (!temVencidas) {
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId).eq("tipo", "mensalidade_vencida");
  }
  if (!vencendoEm3Dias) {
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId).eq("tipo", "mensalidade_vencendo");
  }
}
