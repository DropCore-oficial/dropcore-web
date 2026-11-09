import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyUserEmail } from "@/lib/notifyEmail";

const TIPO = "deposito_pix_forcado" as const;

/**
 * Notifica owners/admins da org (sino + e-mail) sempre que alguém aprova manualmente um
 * depósito PIX com `force: true` — ou seja, sem o Mercado Pago confirmar o pagamento.
 * É o único ponto do fluxo financeiro que credita saldo confiando só no julgamento de quem
 * aprovou (comprovante em mãos), sem checagem automática — por isso todo force vira alerta
 * imediato em outro canal, não só linha no audit log (achado 2026-11-08).
 */
export async function notifyAdminsDepositoPixForcado(params: {
  org_id: string;
  deposito_id: string;
  seller_id: string;
  seller_nome?: string | null;
  valor: number;
  forcado_por_user_id: string;
}): Promise<void> {
  const { data: admins } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.org_id)
    .is("fornecedor_id", null)
    .is("seller_id", null)
    .in("role_base", ["owner", "admin"]);

  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(params.valor);
  const titulo = "Depósito PIX aprovado sem confirmação do Mercado Pago";
  const mensagem = `O depósito ${valorBRL}${params.seller_nome ? ` do seller ${params.seller_nome}` : ""} foi aprovado manualmente (force) porque o Mercado Pago não confirmou o pagamento — o saldo já foi creditado. Confira se o comprovante bate com o extrato bancário real.`;

  const destinatarios = (admins ?? []).filter(
    (a): a is { user_id: string } => typeof a.user_id === "string" && a.user_id.length > 0,
  );
  if (destinatarios.length === 0) return;

  await supabaseAdmin.from("notifications").insert(
    destinatarios.map((a) => ({
      user_id: a.user_id,
      tipo: TIPO,
      titulo,
      mensagem,
      metadata: { deposito_id: params.deposito_id, seller_id: params.seller_id, valor: params.valor, forcado_por_user_id: params.forcado_por_user_id },
    })),
  );

  await Promise.all(
    destinatarios.map((a) =>
      notifyUserEmail({
        userId: a.user_id,
        subject: `⚠️ ${titulo}`,
        titulo,
        mensagem,
      }),
    ),
  );
}

export { TIPO as NOTIFICACAO_TIPO_DEPOSITO_PIX_FORCADO };
