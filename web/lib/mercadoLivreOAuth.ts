/**
 * OAuth2 do Mercado Livre — mesmo formato de client credentials + troca/renovação de
 * `blingOAuth.ts`. Fluxo: authorization_code (redirect_uri estático, carrega seller/org via
 * `state`), token expira em 6h, renova com refresh_token.
 * Docs: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
 */
import { CANONICAL_SITE_ORIGIN } from "@/lib/siteUrl";

const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export type MercadoLivreOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  user_id?: number;
};

export function getMercadoLivreRedirectUri(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const origin = raw?.startsWith("http") ? raw : CANONICAL_SITE_ORIGIN;
  return `${origin}/seller/integracoes-marketplace`;
}

function getMercadoLivreAppCredentials() {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("MERCADOLIVRE_CLIENT_ID ou MERCADOLIVRE_CLIENT_SECRET não configurado no servidor.");
  }
  return { clientId, clientSecret };
}

/** state carrega o seller_id pra casar o retorno do redirect; ver rota de callback. */
export function buildMercadoLivreAuthorizationUrl(state: string): string {
  const { clientId } = getMercadoLivreAppCredentials();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getMercadoLivreRedirectUri(),
    state,
  });
  return `${ML_AUTH_URL}?${params.toString()}`;
}

function parseMercadoLivreTokenError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  const error = record.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  return null;
}

export async function exchangeMercadoLivreAuthorizationCode(
  code: string
): Promise<MercadoLivreOAuthTokenResponse> {
  const { clientId, clientSecret } = getMercadoLivreAppCredentials();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: code.trim(),
    redirect_uri: getMercadoLivreRedirectUri(),
  });

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as MercadoLivreOAuthTokenResponse &
    Record<string, unknown>;
  if (!res.ok) {
    const detail = parseMercadoLivreTokenError(json);
    throw new Error(detail ?? "Não foi possível trocar o código de autorização do Mercado Livre por tokens.");
  }
  if (typeof json.access_token !== "string" || !json.access_token.trim()) {
    throw new Error("Resposta do Mercado Livre sem access_token.");
  }
  return json;
}

export function computeMercadoLivreAccessTokenExpiresAt(expiresIn?: number): string | null {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function refreshMercadoLivreAccessToken(
  refreshToken: string
): Promise<MercadoLivreOAuthTokenResponse> {
  const { clientId, clientSecret } = getMercadoLivreAppCredentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken.trim(),
  });

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as MercadoLivreOAuthTokenResponse &
    Record<string, unknown>;
  if (!res.ok) {
    const detail = parseMercadoLivreTokenError(json);
    throw new Error(detail ?? "Não foi possível renovar o token do Mercado Livre.");
  }
  if (typeof json.access_token !== "string" || !json.access_token.trim()) {
    throw new Error("Resposta do Mercado Livre sem access_token ao renovar.");
  }
  return json;
}
