/**
 * Espelho por e-mail de notificações já geradas pelo sistema (tabela `notifications`).
 * Não decide regra de negócio — só formata e envia o que o chamador já calculou.
 * Falha de e-mail nunca deve derrubar o fluxo principal (webhook PIX, cron, etc.):
 * todo erro aqui é logado e engolido.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resendConfigured, sendEmail } from "@/lib/resend";
import { LOGO_GREEN_HEX, PRIMARY_ACTION_BLUE_HEX } from "@/lib/dropcorePalette";

async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

function renderEmailHtml(params: { titulo: string; mensagem: string; ctaUrl?: string; ctaLabel?: string }): string {
  const cta =
    params.ctaUrl && params.ctaLabel
      ? `<a href="${params.ctaUrl}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${PRIMARY_ACTION_BLUE_HEX};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${params.ctaLabel}</a>`
      : "";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#111827;">
  <div style="font-size:20px;font-weight:700;color:${LOGO_GREEN_HEX};margin-bottom:24px;">DropCore</div>
  <h1 style="font-size:17px;font-weight:600;margin:0 0 12px;">${params.titulo}</h1>
  <p style="font-size:14px;line-height:1.6;color:#374151;margin:0;">${params.mensagem}</p>
  ${cta}
  <p style="font-size:12px;color:#9ca3af;margin-top:32px;">Você recebeu este e-mail porque tem uma conta no DropCore.</p>
</div>`;
}

/** Envia por e-mail o espelho de uma notificação já decidida pelo chamador, pro dono do user_id. */
export async function notifyUserEmail(params: {
  userId: string;
  subject: string;
  titulo: string;
  mensagem: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): Promise<void> {
  if (!resendConfigured) return;
  try {
    const email = await getUserEmail(params.userId);
    if (!email) return;
    await sendEmail({
      to: email,
      subject: params.subject,
      html: renderEmailHtml(params),
    });
  } catch (e: unknown) {
    console.error("[notifyEmail] falha ao enviar:", params.subject, e);
  }
}
