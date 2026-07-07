/**
 * Valor creditado na conta MP após taxas (`transaction_details.net_received_amount`).
 * Fallback: `transaction_amount` (valor bruto da cobrança).
 */
export function valorLiquidoRecebidoMp(payment: Record<string, unknown>): number {
  const td = payment.transaction_details as Record<string, unknown> | undefined;
  const net = td?.net_received_amount;
  if (typeof net === "number" && Number.isFinite(net) && net >= 0) return net;
  const netParsed = parseFloat(String(net ?? ""));
  if (Number.isFinite(netParsed) && netParsed >= 0) return netParsed;
  const gross = payment.transaction_amount;
  const g = typeof gross === "number" ? gross : parseFloat(String(gross ?? ""));
  return Number.isFinite(g) && g >= 0 ? g : 0;
}

export function taxaMercadoPagoMp(payment: Record<string, unknown>, valorBruto: number): number {
  const liquido = valorLiquidoRecebidoMp(payment);
  const taxa = Math.round((valorBruto - liquido) * 100) / 100;
  return taxa > 0 ? taxa : 0;
}

export function pagoEmFromMpPayment(payment: Record<string, unknown>): string | null {
  const raw = payment.date_approved;
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export async function buscarPagamentoMpAprovado(
  paymentId: string
): Promise<Record<string, unknown> | null> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token || !paymentId?.trim()) return null;

  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId.trim())}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payment = (await res.json()) as Record<string, unknown>;
  if (!res.ok || String(payment?.status ?? "").toLowerCase() !== "approved") return null;
  return payment;
}
