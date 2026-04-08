/**
 * Origem pública (https://host) para montar links absolutos (convites, etc.).
 * Prioriza o host do request atual para não gerar links para NEXT_PUBLIC_APP_URL errado.
 */

import { getSiteUrl } from "@/lib/siteUrl";

function hostnameOnly(host: string): string {
  return host.split(":")[0].trim().toLowerCase();
}

export function isAllowedAppHost(hostname: string): boolean {
  const h = hostnameOnly(hostname);
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".vercel.app")) return true;
  if (h === "dropcore.com.br" || h === "www.dropcore.com.br") return true;
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (app) {
    try {
      if (new URL(app).hostname.toLowerCase() === h) return true;
    } catch {
      /* ignore */
    }
  }
  const vu = process.env.VERCEL_URL;
  if (vu && hostnameOnly(vu) === h) return true;
  return false;
}

/** Base URL sem barra final; string vazia se não houver origem confiável. */
export function resolvePublicOrigin(req: Request): string {
  try {
    const u = new URL(req.url);
    if (isAllowedAppHost(u.hostname)) {
      const proto = u.protocol.replace(":", "") || "https";
      return `${proto}://${u.host}`.replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (xfHost && isAllowedAppHost(xfHost)) {
    return `${xfProto}://${xfHost}`.replace(/\/+$/, "");
  }
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (env.startsWith("http")) return env;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }
  return "";
}

/**
 * Base para links de convite (fornecedor, seller, etc.).
 * Em produção na Vercel sem NEXT_PUBLIC_APP_URL, usa getSiteUrl() para não gerar links
 * *.vercel.app órfãos (DEPLOYMENT_NOT_FOUND quando o hostname não aponta mais a um deploy).
 */
export function resolveInvitePublicOrigin(req: Request): string {
  const envBase = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (envBase) return envBase;

  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
    return getSiteUrl();
  }

  const fromReq = resolvePublicOrigin(req);
  if (fromReq) return fromReq;

  if (process.env.VERCEL === "1" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }

  return getSiteUrl();
}
