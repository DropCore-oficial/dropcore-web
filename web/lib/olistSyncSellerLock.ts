import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Lock de concorrência POR SELLER entre os crons que usam o token Olist do seller
 * (olist-sync, etiqueta-olist-retry, olist-sync-precos) — evita 2 crons batendo no mesmo
 * token ao mesmo tempo (a Tiny tem um erro específico pra "excesso de requisições
 * concorrentes", diferente do rate limit de volume já coberto por
 * `olistRateLimitCooldown.ts`).
 *
 * Coluna com TTL (`seller_olist_integrations.olist_sync_locked_until`), não advisory lock
 * do Postgres: `supabaseAdmin` fala com o banco via PostgREST (HTTP) — "pegar" o lock numa
 * chamada e "soltar" em outra não garante ser a mesma conexão/sessão, premissa do
 * `pg_try_advisory_lock`/`pg_advisory_unlock`. Um UPDATE condicional é atômico
 * independente de pooling de conexão, e o TTL expira sozinho se o release não rodar
 * (crash no meio do cron).
 */
const DEFAULT_TTL_SECONDS = 120;

export async function tryLockSellerOlistSync(
  sellerId: string,
  holder: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<boolean> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update({ olist_sync_locked_until: until, olist_sync_locked_by: holder })
    .eq("seller_id", sellerId)
    .or(`olist_sync_locked_until.is.null,olist_sync_locked_until.lt.${now}`)
    .select("seller_id");

  if (error) {
    // Coluna pode não existir ainda (script não rodado) ou erro transitório — trata como
    // "não conseguiu o lock" (mais seguro pular a rodada do que arriscar concorrência real).
    console.error("[olistSyncSellerLock] tryLock:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

export async function releaseSellerOlistSync(sellerId: string, holder: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update({ olist_sync_locked_until: null, olist_sync_locked_by: null })
    .eq("seller_id", sellerId)
    .eq("olist_sync_locked_by", holder);

  if (error) {
    console.error("[olistSyncSellerLock] release:", error.message);
  }
}
