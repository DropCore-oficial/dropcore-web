/**
 * Autenticação do webhook Olist/Tiny (pedidos).
 * Produção: exige `?w=` (ingest por seller) ou secret global configurado — nunca só CNPJ.
 */

export function isOlistLegacyWebhookSecretValid(req: Request): boolean {
  const expected = process.env.OLIST_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret")?.trim() ?? "";
  const h = req.headers.get("x-dropcore-olist-secret")?.trim() ?? "";
  return q === expected || h === expected;
}

export function olistWebhookRequiresIngestToken(): boolean {
  return !isOlistLegacyWebhookSecretConfigured();
}

export function isOlistLegacyWebhookSecretConfigured(): boolean {
  return Boolean(process.env.OLIST_WEBHOOK_SECRET?.trim());
}
