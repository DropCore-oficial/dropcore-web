import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "alteracao_produto_pendente" as const;

/**
 * Notifica owners/admins da org que há nova pendência em Alterações de produtos
 * (edição de SKU ou pedido de exclusão de grupo).
 */
export async function notifyAdminsAlteracaoProdutoPendente(params: {
  org_id: string;
  titulo: string;
  mensagem: string;
  metadata?: Record<string, unknown>;
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
      titulo: params.titulo,
      mensagem: params.mensagem,
      metadata: (params.metadata ?? {}) as Record<string, unknown>,
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}

export { TIPO as NOTIFICACAO_TIPO_ALTERACAO_PRODUTO_PENDENTE };
