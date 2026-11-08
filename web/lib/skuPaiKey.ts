/** Pai do grupo a partir do código SKU (últimos 3 dígitos → 000). Usado pra agrupar
 * numerações/cores do mesmo produto e montar deep-links entre telas. */
export function paiKeyDoSku(sku: string | null | undefined): string {
  const s = String(sku ?? "").trim();
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}
