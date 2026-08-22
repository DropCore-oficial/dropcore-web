/**
 * Cliente autenticado da API do Mercado Livre pro lado servidor (crons, gestores de IA).
 * Cuida de decriptar/renovar o token salvo em seller_mercadolivre_integrations — os jobs
 * batch (gestorAnunciosSeoDados.ts etc.) não sabem nada de OAuth, só chamam getValid... e
 * usam o token pronto.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret, encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { refreshMercadoLivreAccessToken, computeMercadoLivreAccessTokenExpiresAt } from "@/lib/mercadoLivreOAuth";

const ML_API_BASE = "https://api.mercadolibre.com";

export type MercadoLivreAuthContext = { accessToken: string; mlUserId: string };

/** Renova com 5min de folga antes do vencimento real, pra nunca usar um token na borda da expiração. */
const RENOVAR_ANTES_MS = 5 * 60 * 1000;

export async function getValidMercadoLivreAccessToken(
  sellerId: string
): Promise<MercadoLivreAuthContext | null> {
  const { data: row, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token, ml_refresh_token, ml_access_token_expires_at")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error || !row?.ml_access_token || !row.ml_user_id) return null;

  const expiraEm = row.ml_access_token_expires_at ? new Date(row.ml_access_token_expires_at).getTime() : 0;
  const precisaRenovar = !expiraEm || expiraEm - Date.now() < RENOVAR_ANTES_MS;

  if (!precisaRenovar) {
    return { accessToken: decryptSellerErpSecret(row.ml_access_token), mlUserId: row.ml_user_id };
  }

  if (!row.ml_refresh_token) return null;
  const refreshToken = decryptSellerErpSecret(row.ml_refresh_token);
  const tokens = await refreshMercadoLivreAccessToken(refreshToken);

  await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .update({
      ml_access_token: encryptSellerErpSecret(tokens.access_token),
      ml_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : row.ml_refresh_token,
      ml_access_token_expires_at: computeMercadoLivreAccessTokenExpiresAt(tokens.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("seller_id", sellerId);

  return { accessToken: tokens.access_token, mlUserId: row.ml_user_id };
}

async function mlGet<T>(path: string, accessToken: string): Promise<T | null> {
  const res = await fetch(`${ML_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type MercadoLivreItemSearchResult = { results: string[]; paging: { total: number } };

export async function mlBuscarItensAtivos(
  ctx: MercadoLivreAuthContext,
  limit = 100
): Promise<string[]> {
  const json = await mlGet<MercadoLivreItemSearchResult>(
    `/users/${ctx.mlUserId}/items/search?status=active&limit=${limit}`,
    ctx.accessToken
  );
  return json?.results ?? [];
}

export type MercadoLivreItemDetail = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  start_time: string;
  category_id: string;
  pictures?: { id: string }[];
};

/** ML aceita até 20 ids por chamada no multiget — quem chama é responsável por dividir em lotes. */
export async function mlBuscarItensDetalhe(
  ids: string[],
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreItemDetail[]> {
  if (ids.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));

  const itens: MercadoLivreItemDetail[] = [];
  for (const lote of lotes) {
    const json = await mlGet<Array<{ code: number; body: MercadoLivreItemDetail }>>(
      `/items?ids=${lote.join(",")}`,
      ctx.accessToken
    );
    for (const entry of json ?? []) {
      if (entry.code === 200 && entry.body) itens.push(entry.body);
    }
  }
  return itens;
}

export async function mlBuscarDescricao(itemId: string, ctx: MercadoLivreAuthContext): Promise<string> {
  const json = await mlGet<{ plain_text?: string }>(`/items/${itemId}/description`, ctx.accessToken);
  return json?.plain_text?.trim() ?? "";
}

export async function mlBuscarVisitas30d(itemId: string, ctx: MercadoLivreAuthContext): Promise<number> {
  const json = await mlGet<{ total_visits?: number }>(
    `/items/${itemId}/visits/time_window?last=30&unit=day`,
    ctx.accessToken
  );
  return json?.total_visits ?? 0;
}
