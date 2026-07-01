/** Intervalos esperados dos crons Olist (minutos). */
export const OLIST_CRON_PEDIDOS_MIN = 1;
export const OLIST_CRON_ESTOQUE_FORNECEDOR_MIN = 1;
export const OLIST_CRON_PRECOS_MIN = 10;

/** Alerta se última sync passou de N× o intervalo (cron parado ou falhou). */
export const OLIST_SYNC_STALE_MULTIPLIER = 3;

export function isOlistSyncStale(
  lastAt: string | null | undefined,
  intervalMinutes: number,
  multiplier = OLIST_SYNC_STALE_MULTIPLIER,
): boolean {
  if (!lastAt?.trim()) return false;
  const t = new Date(lastAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > intervalMinutes * 60 * 1000 * multiplier;
}

export function olistWebhookJaRecebido(webhookLastAt: string | null | undefined): boolean {
  return Boolean(webhookLastAt?.trim());
}

export type OlistModoOperacao = "webhook_ativo" | "consulta_automatica";

export function resolverOlistModoOperacao(webhookLastAt: string | null | undefined): OlistModoOperacao {
  return olistWebhookJaRecebido(webhookLastAt) ? "webhook_ativo" : "consulta_automatica";
}
