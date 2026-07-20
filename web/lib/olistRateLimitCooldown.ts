import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Cooldown persistido em `seller_olist_integrations.olist_rate_limited_until`.
 *
 * Antes disso, cada cron (olist-sync, etiqueta-olist-retry, fornecedor-olist-sync-estoque,
 * olist-sync-precos) só evitava bater na Olist de novo DENTRO da própria execução — o
 * próximo tick do cron (1 a 15 min depois) começava do zero e martelava o mesmo
 * token/seller já bloqueado. Este módulo é compartilhado pelos 4 crons pra que a detecção
 * de rate limit em qualquer um deles blinde os outros até o cooldown passar.
 */
const OLIST_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;

export async function markSellerOlistRateLimited(sellerId: string): Promise<void> {
  const until = new Date(Date.now() + OLIST_RATE_LIMIT_COOLDOWN_MS).toISOString();
  const { error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update({ olist_rate_limited_until: until })
    .eq("seller_id", sellerId);
  if (error) {
    console.error("[olist-rate-limit-cooldown] falha ao gravar cooldown:", error.message);
  }
}

export function isSellerOlistRateLimited(row: { olist_rate_limited_until?: string | null }): boolean {
  if (!row.olist_rate_limited_until) return false;
  const until = new Date(row.olist_rate_limited_until).getTime();
  return Number.isFinite(until) && until > Date.now();
}
