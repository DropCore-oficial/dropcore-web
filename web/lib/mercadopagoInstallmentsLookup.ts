/**
 * Consulta o valor REAL cobrado pela Mercado Pago por parcela (a mesma fonte de dados que
 * o próprio Card Brick usa pra mostrar "2x de R$274,10 (R$548,20)" na tela) — usado pra
 * cobrar exatamente esse total no servidor, sem estimar/chutar taxa. Ver
 * `app/api/seller/deposito-pix/[id]/cobranca-cartao/route.ts`.
 */
export type InstallmentQuote = { installments: number; totalAmount: number; installmentRate: number };

export async function buscarParcelaReal(params: {
  amount: number;
  paymentMethodId: string;
  installments: number;
}): Promise<InstallmentQuote | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const url = new URL("https://api.mercadopago.com/v1/payment_methods/installments");
  url.searchParams.set("amount", String(params.amount));
  url.searchParams.set("payment_method_id", params.paymentMethodId);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as
    | Array<{ payer_costs?: Array<{ installments: number; total_amount: number; installment_rate: number }> }>
    | null;
  const payerCosts = data?.[0]?.payer_costs ?? [];
  const match = payerCosts.find((p) => p.installments === params.installments);
  if (!match) return null;

  return {
    installments: match.installments,
    totalAmount: Math.round(match.total_amount * 100) / 100,
    installmentRate: match.installment_rate,
  };
}
