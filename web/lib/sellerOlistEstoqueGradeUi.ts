/** Acima disso, a Olist costuma deixar vazia a coluna de estoque na linha pai (grade), mesmo com filhos ok. */
export const OLIST_ESTOQUE_GRADE_PAI_WARN_MIN_VARIACOES = 40;

export function deveAvisarOlistEstoqueGradePai(qtdVariacoes: number): boolean {
  return qtdVariacoes >= OLIST_ESTOQUE_GRADE_PAI_WARN_MIN_VARIACOES;
}

export const OLIST_ESTOQUE_GRADE_PAI_HINT_CURTO =
  "Na Olist, produtos com muitas variações podem ficar sem estoque na linha do pai na listagem — confira dentro de cada variação.";
