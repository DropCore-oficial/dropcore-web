import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret, encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { computeBlingAccessTokenExpiresAt, refreshBlingAccessToken } from "@/lib/blingOAuth";

const REFRESH_MARGIN_MS = 60_000;

type SellerBlingRow = {
  seller_id: string;
  bling_access_token: string | null;
  bling_refresh_token: string | null;
  bling_access_token_expires_at: string | null;
};

function isExpiredOrNear(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs - Date.now() <= REFRESH_MARGIN_MS;
}

/**
 * Retorna o access_token Bling válido para o seller, renovando via refresh_token
 * quando estiver expirado ou perto de expirar (mesmo padrão lazy-refresh usado
 * antes de qualquer chamada à API do Bling).
 */
export async function getSellerBlingAccessToken(sellerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("seller_bling_integrations")
    .select("seller_id, bling_access_token, bling_refresh_token, bling_access_token_expires_at")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as SellerBlingRow;
  if (!row.bling_access_token) return null;

  if (!isExpiredOrNear(row.bling_access_token_expires_at)) {
    try {
      return decryptSellerErpSecret(row.bling_access_token);
    } catch {
      return null;
    }
  }

  if (!row.bling_refresh_token) return null;

  let refreshToken: string;
  try {
    refreshToken = decryptSellerErpSecret(row.bling_refresh_token);
  } catch {
    return null;
  }

  const tokens = await refreshBlingAccessToken(refreshToken);
  const expiresAt = computeBlingAccessTokenExpiresAt(tokens.expires_in);

  await supabaseAdmin
    .from("seller_bling_integrations")
    .update({
      bling_access_token: encryptSellerErpSecret(tokens.access_token),
      bling_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : row.bling_refresh_token,
      bling_access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("seller_id", sellerId);

  return tokens.access_token;
}
