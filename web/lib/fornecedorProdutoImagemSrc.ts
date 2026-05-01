/**
 * `link_fotos` pode ser URL de imagem direta, pasta no Drive, etc.
 * Para miniatura na lista, só faz sentido usar quando aponta para arquivo de imagem ou storage público.
 */
export function linkFotosComoSrcMiniatura(url: string | null | undefined): string | null {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return null;
  if (s.startsWith("data:image/")) return s;
  const lower = s.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return null;
  if (/\.(jpg|jpeg|png|webp|gif|avif|bmp)(\?|#|$)/i.test(s)) return s;
  if (lower.includes("supabase") && (lower.includes("/object/") || lower.includes("/storage/"))) return s;
  return null;
}

/** URL para `<img src>` — Supabase passa pelo proxy autenticado do fornecedor. */
export function fornecedorProdutoImagemSrc(imagemUrl: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const usaProxy = Boolean(supabaseUrl && imagemUrl.startsWith(supabaseUrl));
  return usaProxy
    ? `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(imagemUrl)}`
    : imagemUrl;
}
