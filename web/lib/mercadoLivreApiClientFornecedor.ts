/**
 * Resolução de token ML válido para o FORNECEDOR — equivalente a
 * `getValidMercadoLivreAccessToken` (seller) em `mercadoLivreApiClient.ts`, mas lendo de
 * `fornecedor_mercadolivre_integrations` via RPC (regra 9) em vez de `.from()` direto.
 * `mlBuscarTodosItensAtivosEPausados`/`mlBuscarItensDetalheComAtributosVariacao` são
 * genéricas (recebem só `ctx`) e são importadas de `mercadoLivreApiClient.ts` — não
 * duplicadas aqui.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret, encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import type { MercadoLivreAuthContext } from "@/lib/mercadoLivreApiClient";
import {
  computeMercadoLivreFornecedorAccessTokenExpiresAt,
  refreshMercadoLivreFornecedorAccessToken,
} from "@/lib/mercadoLivreOAuthFornecedor";

const RENOVAR_ANTES_MS = 5 * 60 * 1000;

type FornecedorMercadoLivreIntegracaoRow = {
  fornecedor_id: string;
  org_id: string;
  ml_user_id: string | null;
  ml_access_token: string | null;
  ml_refresh_token: string | null;
  ml_access_token_expires_at: string | null;
};

export async function getValidMercadoLivreAccessTokenFornecedor(
  fornecedorId: string,
): Promise<MercadoLivreAuthContext | null> {
  const { data: row, error } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_get", {
    p_fornecedor_id: fornecedorId,
  });
  if (error) return null;

  const integracao = (Array.isArray(row) ? row[0] : row) as FornecedorMercadoLivreIntegracaoRow | null;
  if (!integracao?.ml_access_token || !integracao.ml_user_id) return null;

  const expiraEm = integracao.ml_access_token_expires_at
    ? new Date(integracao.ml_access_token_expires_at).getTime()
    : 0;
  const precisaRenovar = !expiraEm || expiraEm - Date.now() < RENOVAR_ANTES_MS;

  if (!precisaRenovar) {
    return { accessToken: decryptSellerErpSecret(integracao.ml_access_token), mlUserId: integracao.ml_user_id };
  }

  if (!integracao.ml_refresh_token) return null;
  const refreshToken = decryptSellerErpSecret(integracao.ml_refresh_token);
  const tokens = await refreshMercadoLivreFornecedorAccessToken(refreshToken);

  await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_upsert", {
    p_fornecedor_id: fornecedorId,
    p_org_id: integracao.org_id,
    p_ml_user_id: integracao.ml_user_id,
    p_ml_access_token: encryptSellerErpSecret(tokens.access_token),
    p_ml_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : integracao.ml_refresh_token,
    p_ml_access_token_expires_at: computeMercadoLivreFornecedorAccessTokenExpiresAt(tokens.expires_in),
  });

  return { accessToken: tokens.access_token, mlUserId: integracao.ml_user_id };
}
