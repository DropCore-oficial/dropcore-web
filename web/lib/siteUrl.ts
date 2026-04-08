/**
 * Domínio canónico de produção (convites, redirects, OG).
 * Sem barra final.
 */
export const CANONICAL_SITE_ORIGIN = "https://dropcore.com.br";

function trimUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

/**
 * URL pública do site (OG, links, redirects).
 * Ignora NEXT_PUBLIC_APP_URL quando aponta para outro *.vercel.app que não é
 * o deploy atual (ex.: dropcore.vercel.app órfão → DEPLOYMENT_NOT_FOUND).
 */
export function getSiteUrl(): string {
  const raw = trimUrl(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const onVercel = process.env.VERCEL === "1";
  const vu = (process.env.VERCEL_URL ?? "").trim().toLowerCase();
  const envKind = process.env.VERCEL_ENV;

  if (!raw || !raw.startsWith("http")) {
    if (onVercel && vu && envKind !== "production") {
      return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
    }
    return CANONICAL_SITE_ORIGIN;
  }

  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host.endsWith(".vercel.app")) return raw;

    if (!onVercel) return raw;

    if (vu && host === vu) return raw;

    if (envKind !== "production" && vu) {
      return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
    }

    return CANONICAL_SITE_ORIGIN;
  } catch {
    return CANONICAL_SITE_ORIGIN;
  }
}
