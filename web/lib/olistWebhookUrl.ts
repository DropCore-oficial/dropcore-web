import { CANONICAL_SITE_ORIGIN, getSiteUrl } from "@/lib/siteUrl";

/**
 * Origem usada na URL do webhook da Olist (sempre acessível na internet).
 * - `NEXT_PUBLIC_APP_URL` em localhost gera link inútil para a Olist; nesse caso usamos o domínio canónico.
 * - Opcional: `OLIST_WEBHOOK_PUBLIC_BASE` (ex.: túnel ngrok) sobrescreve só a base do webhook.
 */
function webhookCallbackBase(): string {
  const override = process.env.OLIST_WEBHOOK_PUBLIC_BASE?.trim();
  if (override && /^https?:\/\//i.test(override)) {
    return override.replace(/\/+$/, "");
  }

  const trimmed = getSiteUrl().replace(/\/+$/, "");
  try {
    const { hostname } = new URL(trimmed);
    const h = hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
      return CANONICAL_SITE_ORIGIN.replace(/\/+$/, "");
    }
  } catch {
    return CANONICAL_SITE_ORIGIN.replace(/\/+$/, "");
  }
  return trimmed;
}

/** URL pública para colar na Olist/Tiny → Webhooks → notificações de pedidos. */
export function buildOlistPedidosWebhookUrl(): string {
  const base = webhookCallbackBase();
  const secret = process.env.OLIST_WEBHOOK_SECRET?.trim();
  const path = "/api/webhooks/olist";
  const url = `${base}${path}`;
  if (secret) {
    return `${url}?secret=${encodeURIComponent(secret)}`;
  }
  return url;
}
