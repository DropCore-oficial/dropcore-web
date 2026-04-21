/** Meses mínimos de permanência com o mesmo fornecedor após o vínculo (regra comercial). */
export const MESES_MINIMOS_COM_FORNECEDOR = 3;

/** Data a partir da qual o seller pode trocar ou remover o fornecedor (sem liberação antecipada). */
export function dataMinimaTrocaFornecedor(vinculadoEmIso: string | null | undefined): Date | null {
  if (!vinculadoEmIso || typeof vinculadoEmIso !== "string") return null;
  const d = new Date(vinculadoEmIso);
  if (Number.isNaN(d.getTime())) return null;
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + MESES_MINIMOS_COM_FORNECEDOR);
  return out;
}

/** Pode trocar/remover fornecedor: já passou o prazo OU liberação antecipada OU admin confirmou exceção. */
export function podeTrocarFornecedorAgora(
  vinculadoEmIso: string | null | undefined,
  liberadoAntecipado: boolean,
  confirmarTrocaAntesPrazoAdmin: boolean
): boolean {
  if (liberadoAntecipado || confirmarTrocaAntesPrazoAdmin) return true;
  const min = dataMinimaTrocaFornecedor(vinculadoEmIso);
  if (!min) return true;
  return Date.now() >= min.getTime();
}
