/**
 * ViaCEP só aceita CEP com exatamente 8 dígitos. Muita gente omite o zero à esquerda
 * (ex.: 07538-230 digitado como 7538230).
 */

/** Só números, no máximo 8 (o que o usuário digitou). */
export function apenasDigitosCep(input: string): string {
  return input.replace(/\D/g, "").slice(0, 8);
}

/**
 * Retorna 8 dígitos para a URL do ViaCEP, ou `null` se ainda faltam números.
 * - 8 dígitos: usados como estão.
 * - 7 dígitos: um zero à esquerda (caso mais comum de erro).
 */
export function cepParaConsultaViaCep(input: string): string | null {
  const d = apenasDigitosCep(input);
  if (d.length === 8) return d;
  if (d.length === 7) return `0${d}`;
  return null;
}
