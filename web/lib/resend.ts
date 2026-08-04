import { Resend } from "resend";

function getApiKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

/** Sem isso, envio de e-mail transacional falha silenciosamente. */
export const resendConfigured = Boolean(getApiKey());

if (process.env.NODE_ENV === "development" && !resendConfigured) {
  console.warn(
    "[resend] RESEND_API_KEY ausente em .env.local. Envio de e-mail vai falhar no localhost."
  );
}

let client: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "Resend não configurado: defina RESEND_API_KEY (ex.: variável de ambiente na Vercel)."
    );
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL?.trim() || "DropCore <onboarding@resend.dev>";

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}): Promise<void> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: params.from ?? DEFAULT_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  });
  if (error) {
    throw new Error(`[resend] Falha ao enviar e-mail: ${error.message}`);
  }
}
