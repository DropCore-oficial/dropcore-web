import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptCalculadoraAssinanteSecret, decryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";
import {
  refreshMercadoLivreAvulsoAccessToken,
  computeMercadoLivreAvulsoAccessTokenExpiresAt,
} from "@/lib/mercadoLivreOAuthAvulso";
import type { MercadoLivreAuthContext } from "@/lib/mercadoLivreApiClient";

const RENOVAR_ANTES_MS = 5 * 60 * 1000;

/**
 * Mesmo padrão de `getValidMercadoLivreAccessToken` (hub), mas lendo/gravando em
 * `calculadora_assinante_mercadolivre_integrations` com a criptografia própria do avulso —
 * nunca toca em `seller_mercadolivre_integrations`.
 */
export async function getValidMercadoLivreAvulsoAccessToken(
  assinanteId: string,
): Promise<MercadoLivreAuthContext | null> {
  const { data: row, error } = await supabaseAdmin
    .from("calculadora_assinante_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token, ml_refresh_token, ml_access_token_expires_at")
    .eq("assinante_id", assinanteId)
    .maybeSingle();
  if (error || !row?.ml_access_token || !row.ml_user_id) return null;

  const expiraEm = row.ml_access_token_expires_at ? new Date(row.ml_access_token_expires_at).getTime() : 0;
  const precisaRenovar = !expiraEm || expiraEm - Date.now() < RENOVAR_ANTES_MS;

  if (!precisaRenovar) {
    return { accessToken: decryptCalculadoraAssinanteSecret(row.ml_access_token), mlUserId: row.ml_user_id };
  }

  if (!row.ml_refresh_token) return null;
  const refreshToken = decryptCalculadoraAssinanteSecret(row.ml_refresh_token);
  const tokens = await refreshMercadoLivreAvulsoAccessToken(refreshToken);

  await supabaseAdmin
    .from("calculadora_assinante_mercadolivre_integrations")
    .update({
      ml_access_token: encryptCalculadoraAssinanteSecret(tokens.access_token),
      ml_refresh_token: tokens.refresh_token
        ? encryptCalculadoraAssinanteSecret(tokens.refresh_token)
        : row.ml_refresh_token,
      ml_access_token_expires_at: computeMercadoLivreAvulsoAccessTokenExpiresAt(tokens.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("assinante_id", assinanteId);

  return { accessToken: tokens.access_token, mlUserId: row.ml_user_id };
}
