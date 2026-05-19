/** Versão dos termos de recarga de créditos (aceite na API e UI). */
export const SELLER_CREDITO_TERMOS_VERSAO = "credit_terms_v2";

/** Validade de cada recarga aprovada (meses). */
export const SELLER_CREDITO_MESES_VALIDADE = 12;

export function sellerCreditoExpiraEm(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + SELLER_CREDITO_MESES_VALIDADE);
  return d;
}

export function sellerCreditoExpiraEmIso(from: Date = new Date()): string {
  return sellerCreditoExpiraEm(from).toISOString();
}

/** Recarga ≠ mensalidade — linha curta (cards, subtítulos). */
export const SELLER_CREDITO_NAO_PAGA_MENSALIDADE =
  "Recarga de créditos é só para pedidos na plataforma. Não paga a mensalidade do plano.";

/** Mensalidade ≠ recarga — modal PIX da mensalidade. */
export const SELLER_MENSALIDADE_NAO_E_RECARGA =
  "Este PIX é da mensalidade do plano (acesso ao painel). Não vira crédito para pedidos e não substitui a recarga.";

/** Texto curto do checkbox (deve bater com a UI e o registro na API). */
export const SELLER_CREDITO_CHECKBOX_LABEL =
  "Li e aceito que o pagamento vira créditos DropCore para pedidos (não paga mensalidade do plano), sem reembolso ou saque, validade de 12 meses, conforme as regras de créditos.";
