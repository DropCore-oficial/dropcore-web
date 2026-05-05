/**
 * Indica se uma order GET /v1/orders/{id} representa pagamento efetivamente creditado.
 * Não basta `status === "processed"` sem `status_detail` — evita crédito sem PIX pago.
 *
 * @see https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/payment-management/status/order-status
 */
export function mercadoPagoOrderIndicaPagamentoCredito(order: Record<string, unknown> | null | undefined): boolean {
  if (!order || typeof order !== "object") return false;

  const payments = (order.transactions as { payments?: Array<{ status?: string }> } | undefined)?.payments ?? [];
  if (payments.some((p) => String(p?.status ?? "").toLowerCase() === "approved")) {
    return true;
  }

  const st = String(order.status ?? "").toLowerCase();
  const detail = String((order as { status_detail?: string }).status_detail ?? "").toLowerCase();

  if (st === "processed") {
    return detail === "accredited" || detail === "partially_refunded";
  }

  return false;
}

/** Compara total_amount da order (string BRL) com o valor esperado do depósito. */
export function mercadoPagoOrderValorCompativel(
  order: Record<string, unknown> | null | undefined,
  valorEsperado: number
): boolean {
  if (!order || typeof order !== "object") return false;
  const raw = (order as { total_amount?: string }).total_amount;
  if (raw == null || String(raw).trim() === "") return false;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || !Number.isFinite(valorEsperado)) return false;
  return Math.abs(n - valorEsperado) < 0.05;
}
