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

/**
 * "em aberto" sai daqui de propósito: esses pedidos não são importados como venda,
 * mas passam a ser buscados na listagem (pesquisa) para virar reserva de estoque —
 * ver `isSituacaoTextoEmAberto` e `processOlistPedidoReserva`.
 */
const OLIST_SKIP_SITUACOES = new Set(["cancelado", "dados incompletos"]);

const OLIST_SKIP_CODIGOS = new Set(["aberto", "cancelado"]);

export function normalizeOlistSituacaoText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeOlistCnpjDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeOlistSituacaoTextoBase(value: string | null | undefined): string {
  const normalized = normalizeOlistSituacaoText(value);
  if (!normalized) return "";
  return normalized.replace(/\s*\([^)]*\)/g, "").trim();
}

export function shouldImportSituacaoText(situacao: string | null | undefined): boolean {
  const normalized = normalizeOlistSituacaoText(situacao);
  const base = normalizeOlistSituacaoTextoBase(situacao);
  if (!normalized && !base) return false;
  if (OLIST_SKIP_SITUACOES.has(normalized) || (base && OLIST_SKIP_SITUACOES.has(base))) return false;
  if (OLIST_IMPORT_SITUACOES.has(normalized) || (base && OLIST_IMPORT_SITUACOES.has(base))) return true;
  const codigoLike = base.replace(/\s+/g, "_");
  if (OLIST_IMPORT_CODIGOS_SITUACAO.has(codigoLike)) return true;
  return false;
}

/**
 * Na listagem `pedidos.pesquisa`, a situação às vezes vem vazia (marketplace/Shopee).
 * Só ignoramos cedo quando a lista traz situação claramente não importável; senão buscamos o detalhe.
 */
export function shouldSkipSituacaoTextOnPesquisa(situacao: string | null | undefined): boolean {
  const base = normalizeOlistSituacaoTextoBase(situacao);
  if (!base) return false;
  return OLIST_SKIP_SITUACOES.has(base);
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

/** Pedido aguardando pagamento (boleto/PIX) — não importa como venda, mas reserva estoque. */
export function isSituacaoTextoEmAberto(situacao: string | null | undefined): boolean {
  const base = normalizeOlistSituacaoTextoBase(situacao);
  return base === "em aberto";
}

/** `codigoSituacao` do webhook equivalente a "em aberto". */
export function isCodigoSituacaoEmAberto(codigo: string | null | undefined): boolean {
  return String(codigo ?? "").trim().toLowerCase() === "aberto";
}

/** Pedido cancelado — libera qualquer reserva de estoque pendente para ele. */
export function isSituacaoTextoCancelada(situacao: string | null | undefined): boolean {
  const base = normalizeOlistSituacaoTextoBase(situacao);
  return base === "cancelado";
}

/** `codigoSituacao` do webhook equivalente a "cancelado". */
export function isCodigoSituacaoCancelado(codigo: string | null | undefined): boolean {
  return String(codigo ?? "").trim().toLowerCase() === "cancelado";
}
