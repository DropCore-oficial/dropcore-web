/** Regras de importação de pedidos Olist/Tiny (polling + webhook). */

const OLIST_IMPORT_SITUACOES = new Set([
  "aprovado",
  "preparando envio",
  "pronto para envio",
  "faturado",
  "enviado",
  "entregue",
]);

/** Códigos oficiais: https://tiny.com.br/api-docs/api2-tabelas-pedidos */
const OLIST_IMPORT_CODIGOS_SITUACAO = new Set([
  "aprovado",
  "preparando_envio",
  "pronto_envio",
  "faturado",
  "enviado",
  "entregue",
]);

const OLIST_SKIP_SITUACOES = new Set(["cancelado", "dados incompletos", "em aberto"]);

const OLIST_SKIP_CODIGOS = new Set(["aberto", "cancelado"]);

export function normalizeOlistSituacaoText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeOlistCnpjDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function shouldImportSituacaoText(situacao: string | null | undefined): boolean {
  const normalized = normalizeOlistSituacaoText(situacao);
  if (!normalized) return false;
  if (OLIST_SKIP_SITUACOES.has(normalized)) return false;
  if (OLIST_IMPORT_SITUACOES.has(normalized)) return true;
  return false;
}

export function shouldImportCodigoSituacao(codigo: string | null | undefined): boolean {
  const c = String(codigo ?? "")
    .trim()
    .toLowerCase();
  if (!c) return false;
  if (OLIST_SKIP_CODIGOS.has(c)) return false;
  return OLIST_IMPORT_CODIGOS_SITUACAO.has(c);
}

/** Webhook manda codigoSituacao; API de detalhe manda texto — aceita se qualquer um importar. */
export function shouldImportPedidoOlist(params: {
  situacaoTexto?: string | null;
  codigoSituacao?: string | null;
}): boolean {
  if (shouldImportCodigoSituacao(params.codigoSituacao)) return true;
  return shouldImportSituacaoText(params.situacaoTexto);
}
