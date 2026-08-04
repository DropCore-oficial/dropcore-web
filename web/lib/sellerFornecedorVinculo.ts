/**
 * Meses mínimos com o armazém atual após cada vínculo ou troca.
 * O `fornecedor_vinculado_em` no seller é atualizado sempre que o `fornecedor_id` muda para outro valor:
 * o mesmo prazo vale para o primeiro vínculo e entre uma troca e outra (evita “pinga-pinga” mensal).
 */
export const MESES_MINIMOS_COM_FORNECEDOR = 3;

/**
 * Dias que o seller tem pra escolher (trocar ou desvincular) depois que fica livre pra
 * trocar de fornecedor — seja porque os `MESES_MINIMOS_COM_FORNECEDOR` naturais venceram,
 * seja porque o admin concedeu liberação antecipada (`fornecedor_desvinculo_liberado = true`).
 * Se o seller não agir nesse prazo, o cron `/api/cron/fornecedor-troca-janela-expira` tranca de
 * novo sozinho: fecha a liberação antecipada (se houver) e reinicia a contagem dos
 * `MESES_MINIMOS_COM_FORNECEDOR` com o mesmo fornecedor atual (`fornecedor_vinculado_em = agora`).
 */
export const DIAS_JANELA_ESCOLHA_FORNECEDOR = 5;

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
