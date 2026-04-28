const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Verifica se a URL aponta para Storage do mesmo projeto Supabase (proxy seguro).
 * Aceita variações de barra final, http/https, desde que o hostname coincida.
 */
export function isSameProjectSupabaseStorageUrl(raw: string): boolean {
  if (!SUPABASE_URL || !raw?.trim()) return false;
  try {
    const base = new URL(SUPABASE_URL.endsWith("/") ? SUPABASE_URL.slice(0, -1) : SUPABASE_URL);
    const u = new URL(raw.trim());
    if (u.hostname !== base.hostname) return false;
    return u.pathname.includes("/storage/v1/");
  } catch {
    return false;
  }
}

/** URL segura para usar no query param do proxy (mesma origem no browser + CSP). */
export function proxiedCatalogoImageSrc(imagemUrl: string | null, width = 384): string | null {
  if (!imagemUrl?.trim()) return null;
  const trimmed = imagemUrl.trim();
  if (!isSameProjectSupabaseStorageUrl(trimmed)) {
    return trimmed;
  }
  return `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(trimmed)}&w=${width}`;
}
