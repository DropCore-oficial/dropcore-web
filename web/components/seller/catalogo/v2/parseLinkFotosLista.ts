/**
 * `link_fotos` no armazém pode ser uma ou várias URLs separadas por vírgula, quebra de linha ou ponto e vírgula.
 */
export function parseLinkFotosLista(raw: string | null | undefined): string[] {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return [];
  const chunks = s
    .split(/(?:\r?\n|[,;|])+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set(chunks)];
}
