import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "etiqueta_olist_falha" as const;

/**
 * Notifica owners/admins da org quando o cron de retry (web/lib/etiquetaOlistRetry.ts)
 * esgota as tentativas automáticas de buscar a etiqueta real de envio na Olist —
 * alguém precisa checar manualmente (ex.: gerar a expedição na própria Olist).
 */
export async function notifyAdminsEtiquetaOlistFalha(params: {
  org_id: string;
  pedido_id: string;
  seller_nome?: string | null;
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .in("role_base", ["owner", "admin"]);

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: "Etiqueta de envio não chegou",
      mensagem: `A etiqueta real de envio (Olist) do pedido ${params.pedido_id}${params.seller_nome ? ` (seller ${params.seller_nome})` : ""} não foi encontrada depois de várias tentativas automáticas. Verifique se a expedição já foi gerada na Olist.`,
      metadata: { pedido_id: params.pedido_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_ETIQUETA_OLIST_FALHA };
