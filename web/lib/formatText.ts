/**
 * Primeira letra de cada palavra em maiúscula (ex.: "camisa manga curta" → "Camisa Manga Curta").
 * Usado em nome_produto, categoria, cor, tamanho, dimensoes_pacote.
 */
export function toTitleCase(value: unknown): string {
  if (value == null || typeof value !== "string") return "";
  const s = value.trim();
  if (!s) return "";
  return s
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
