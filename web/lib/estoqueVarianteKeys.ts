/** Chave estável para estoque por combinação cor × tamanho (API + UI). */
export function chaveEstoqueVariante(cor: string, tamanho: string): string {
  return `${cor.trim().toLowerCase()}|${tamanho.trim().toUpperCase()}`;
}

/** Normaliza chaves vindas do cliente (`"Cor|TAM"` ou só cor). */
export function normalizarChaveEstoqueVarianteApi(k: string): string {
  const s = k.trim();
  const i = s.indexOf("|");
  if (i < 0) return chaveEstoqueVariante(s, "");
  return chaveEstoqueVariante(s.slice(0, i), s.slice(i + 1));
}
