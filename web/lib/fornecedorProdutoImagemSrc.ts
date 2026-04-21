/** URL para `<img src>` — Supabase passa pelo proxy autenticado do fornecedor. */
export function fornecedorProdutoImagemSrc(imagemUrl: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const usaProxy = Boolean(supabaseUrl && imagemUrl.startsWith(supabaseUrl));
  return usaProxy
    ? `/api/fornecedor/produtos/imagem-proxy?url=${encodeURIComponent(imagemUrl)}`
    : imagemUrl;
}
