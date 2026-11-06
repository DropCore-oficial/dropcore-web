import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TIPO = "devolucao_ml_order_cancelada_admin" as const;

/**
 * Notifica admins quando a calibração de devolução sem claim (ver
 * devolucaoSemClaimCalibracao.ts) observa que a `order` do Mercado Livre virou "cancelled"
 * enquanto o ledger ainda está EM_DEVOLUCAO — candidato a sinal de devolução concluída do
 * lado do ML (achado real 2026-11-03, pedido Vinz Collection: `date_returned` do shipment
 * nunca veio preenchido, mas a order virou cancelled coincidindo com a transportadora
 * entregando a mercadoria de volta). Só avisa — não libera dinheiro nem decide nada;
 * confirmação continua manual em /admin/devolucoes até o sinal ser validado em mais casos.
 */
export async function notifyAdminsDevolucaoMlOrderCancelada(params: {
  org_id: string;
  seller_id: string;
  seller_nome?: string | null;
  pedido_id: string;
  ledger_id: string;
}): Promise<void> {
  const { data: jaNotificado } = await supabaseAdmin
    .from("notifications")
    .select("id")
    .eq("tipo", TIPO)
    .contains("metadata", { pedido_id: params.pedido_id })
    .limit(1)
    .maybeSingle();
  if (jaNotificado) return;

  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const rows = (admins ?? [])
    .filter((a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0)
    .map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo: "Mercado Livre marcou pedido como cancelado (devolução em aberto)",
      mensagem: `O pedido do seller${params.seller_nome ? ` ${params.seller_nome}` : ""} está EM_DEVOLUCAO e o Mercado Livre acabou de marcar a order como cancelada — pode ser o sinal de que a devolução terminou do lado do ML. Confira em Bloqueios e devoluções antes de confirmar.`,
      metadata: { seller_id: params.seller_id, pedido_id: params.pedido_id, ledger_id: params.ledger_id },
    }));

  if (rows.length === 0) return;
  await supabaseAdmin.from("notifications").insert(rows);
}
