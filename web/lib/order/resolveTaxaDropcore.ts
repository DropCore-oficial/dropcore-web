function toMoneyNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number.parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Taxa DropCore por unidade: coluna `custo_dropcore` quando > 0;
 * senão 15% sobre `custo_base` (não tratar `custo_dropcore` como preço final).
 * Fonte única — não duplicar em outros pontos que criam/promovem pedido.
 */
export function resolveTaxaDropcoreUnit(custoBaseUnit: number, custoDropcoreRaw: unknown): number {
  const cd = toMoneyNumber(custoDropcoreRaw);
  if (cd != null && cd > 0) return cd;
  return custoBaseUnit * 0.15;
}
