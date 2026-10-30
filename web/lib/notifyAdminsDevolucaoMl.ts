import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "devolucao_ml_provavel_admin" as const;

/**
 * Notifica owners/admins da org quando a detecção de devolução (ver mlDevolucaoDeteccao.ts)
 * encontra uma reclamação do Mercado Livre que parece devolução real (arrependimento ou
 * sem evidência anexada) — v1 só notifica, confirmação em /admin/devolucoes continua manual.
 */
export async function notifyAdminsDevolucaoMl(params: {
  org_id: string;
  seller_id: string;
  seller_nome?: string | null;
  pedido_id: string | null;
  ml_claim_id: string;
  criterio: "repentant" | "sem_evidencia";
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .in("role_base", ["owner", "admin"]);

  const motivoCriterio =
    params.criterio === "repentant"
      ? "o próprio Mercado Livre classificou como arrependimento de compra"
      : "não tem foto/evidência anexada (padrão comum de devolução sem disputa)";

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: "Possível devolução no Mercado Livre",
      mensagem: `Reclamação ${params.ml_claim_id} do seller${params.seller_nome ? ` ${params.seller_nome}` : ""} parece devolução real — ${motivoCriterio}. Confira em Bloqueios e devoluções.`,
      metadata: { seller_id: params.seller_id, pedido_id: params.pedido_id, ml_claim_id: params.ml_claim_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_DEVOLUCAO_ML_ADMIN };
