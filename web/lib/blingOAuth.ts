import { CANONICAL_SITE_ORIGIN } from "@/lib/siteUrl";

const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

export type BlingOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export function getBlingOAuthRedirectUri(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const origin = raw?.startsWith("http") ? raw : CANONICAL_SITE_ORIGIN;
  return `${origin}/seller/integracoes-erp`;
}

function getBlingAppCredentials() {
  const clientId = process.env.BLING_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.BLING_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("BLING_CLIENT_ID ou BLING_CLIENT_SECRET não configurado no servidor.");
  }
  return { clientId, clientSecret };
}

function parseBlingTokenError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  const description = record.error_description;
  if (typeof description === "string" && description.trim()) return description.trim();
  const message = record.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  return null;
}

export async function exchangeBlingAuthorizationCode(code: string): Promise<BlingOAuthTokenResponse> {
  const { clientId, clientSecret } = getBlingAppCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code.trim(),
  });

  const res = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "enable-jwt": "1",
    },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as BlingOAuthTokenResponse & Record<string, unknown>;
  if (!res.ok) {
    const detail = parseBlingTokenError(json);
    throw new Error(detail ?? "Não foi possível trocar o código de autorização do Bling por tokens.");
  }

  if (typeof json.access_token !== "string" || !json.access_token.trim()) {
    throw new Error("Resposta do Bling sem access_token.");
  }

  return json;
}

export function computeBlingAccessTokenExpiresAt(expiresIn?: number): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}
