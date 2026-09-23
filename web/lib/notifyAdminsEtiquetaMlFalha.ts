import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "etiqueta_ml_falha" as const;

/**
 * Notifica owners/admins da org quando o cron de retry (web/lib/etiquetaMlRetry.ts)
 * esgota as tentativas automáticas de buscar a etiqueta real de envio no Mercado Livre —
 * alguém precisa checar manualmente (o ML costuma segurar a etiqueta num buffer de
 * transportadora; ver `mlBuscarPrevisaoLiberacaoEtiqueta`).
 */
export async function notifyAdminsEtiquetaMlFalha(params: {
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
      mensagem: `A etiqueta real de envio (Mercado Livre) do pedido ${params.pedido_id}${params.seller_nome ? ` (seller ${params.seller_nome})` : ""} não foi encontrada depois de várias tentativas automáticas. Pode estar presa no buffer de liberação do próprio ML — verifique na tela de Pedidos.`,
      metadata: { pedido_id: params.pedido_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_ETIQUETA_ML_FALHA };
