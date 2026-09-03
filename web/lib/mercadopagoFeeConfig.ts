/**
 * Taxa Mercado Pago repassada ao seller na recarga de crédito — somada em cima do valor do
 * crédito, nunca descontada dele (o seller sempre recebe exatamente o crédito pedido; ver
 * `depositoPixProcessor.ts`).
 *
 * PIX: confirmado com dado real de `financial_mensalidades` (R$97,90 bruto → R$96,93
 * líquido) bate 0,9908% ≈ 0,99% — taxa fixa, não varia por transação.
 *
 * Cartão: NÃO usa taxa fixa/estimada aqui — o valor cobrado por parcela vem em tempo real
 * de `mercadopagoInstallmentsLookup.ts` (mesma fonte que a própria Mercado Pago usa pra
 * mostrar "2x de R$X (R$Y)" no Card Brick). Isso evita estimar errado uma taxa que varia
 * por parcela e por cartão. 1x (à vista) não é oferecido no cartão porque a MP não expõe
 * markup nenhum ao pagador nesse caso (mostra "à vista", sem taxa) — não tem como repassar
 * uma taxa que ela não mostra; quem quer pagamento único sem parcelar usa o Pix.
 */
export const MP_PIX_FEE_PERCENT = 0.0099;

/**
 * Gross-up: a MP cobra a taxa sobre o valor total transacionado (o que o cliente paga),
 * não sobre o valor líquido do crédito — por isso a taxa é `valorCobrado - valor`, com
 * `valorCobrado = valor / (1 - MP_PIX_FEE_PERCENT)`, não `valor * MP_PIX_FEE_PERCENT`
 * direto (isso subestimava a taxa real repassada pelo MP em ~1% do valor da própria taxa).
 */
export function calcularTaxaPix(valor: number): number {
  const valorCobrado = valor / (1 - MP_PIX_FEE_PERCENT);
  return Math.round((valorCobrado - valor) * 100) / 100;
}
