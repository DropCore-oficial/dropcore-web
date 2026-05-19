/**
 * Checkout Pro (preferência MP) — cartão de crédito/débito para mensalidade.
 */
import { resolvePublicOrigin } from "@/lib/appOrigin";
import { CANONICAL_SITE_ORIGIN, getSiteUrl } from "@/lib/siteUrl";

export type CheckoutPreferenciaResult =
  | { ok: true; init_point: string; preference_id: string }
  | { ok: false; error: string };

function mensagemErroPreferencia(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "Não foi possível abrir o pagamento com cartão. Tente de novo.";
  }
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  return "Não foi possível abrir o pagamento com cartão. Tente de novo.";
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** MP exige back_urls HTTPS válidas; em localhost usa domínio público (ou NEXT_PUBLIC_APP_URL https). */
export function resolveCheckoutPublicOrigin(req?: Request): string {
  const envHttps = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (envHttps.startsWith("https://")) return envHttps;

  if (req) {
    const fromReq = resolvePublicOrigin(req);
    if (fromReq && isHttpsUrl(fromReq)) return fromReq;
  }

  const site = getSiteUrl().replace(/\/$/, "");
  if (isHttpsUrl(site)) return site;

  return CANONICAL_SITE_ORIGIN;
}

function buildBackUrls(origin: string, returnPathBase: string) {
  const basePath = returnPathBase.startsWith("/") ? returnPathBase : `/${returnPathBase}`;
  const q = "mensalidade=retorno";
  const mk = (status: string) => `${origin}${basePath}?${q}&status=${status}`;
  return {
    success: mk("approved"),
    failure: mk("failure"),
    pending: mk("pending"),
  };
}

/** Preferência só com cartão (PIX continua no fluxo dedicado). */
export async function criarPreferenciaCheckoutCartaoMensalidade(params: {
  valor: number;
  titulo: string;
  email: string;
  external_reference: string;
  /** Ex.: /seller/dashboard */
  returnPathBase: string;
  req?: Request;
}): Promise<CheckoutPreferenciaResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: "Mercado Pago não configurado." };
  }

  const origin = resolveCheckoutPublicOrigin(params.req);
  const back_urls = buildBackUrls(origin, params.returnPathBase);

  if (!back_urls.success || !isHttpsUrl(back_urls.success)) {
    return {
      ok: false,
      error:
        "URL de retorno inválida para o Mercado Pago. Configure NEXT_PUBLIC_APP_URL com HTTPS (ex.: https://www.dropcore.com.br).",
    };
  }

  const valorUnit = Math.round(params.valor * 100) / 100;

  const preferenceBody: Record<string, unknown> = {
    items: [
      {
        title: params.titulo.slice(0, 256),
        quantity: 1,
        unit_price: valorUnit,
        currency_id: "BRL",
      },
    ],
    payer: { email: params.email },
    external_reference: params.external_reference,
    notification_url: `${origin}/api/webhooks/mercadopago`,
    back_urls,
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }],
    },
  };

  // auto_return só com success HTTPS — localhost/http quebra com "back_url.success must be defined"
  preferenceBody.auto_return = "approved";

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(preferenceBody),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: mensagemErroPreferencia(data) };
  }

  const initPoint =
    (typeof data.init_point === "string" && data.init_point) ||
    (typeof data.sandbox_init_point === "string" && data.sandbox_init_point) ||
    "";
  const preferenceId = data.id != null ? String(data.id) : "";

  if (!initPoint) {
    return { ok: false, error: "Mercado Pago não retornou link de pagamento." };
  }

  return { ok: true, init_point: initPoint, preference_id: preferenceId };
}
