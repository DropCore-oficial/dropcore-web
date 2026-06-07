import { linkFotosComoSrcMiniatura } from "@/lib/fornecedorProdutoImagemSrc";

/**
 * Capa do SKU pai — mesma regra do catálogo seller e do POST multivariante:
 * link de imagem direta (se houver) ou 1ª foto por cor na ordem do formulário.
 */
export function capaImagemUrlProduto(opts: {
  fotoUrlPorCor: Record<string, string>;
  ordemCores?: string[];
  linkFotos?: string | null;
}): string | null {
  const fromLink = linkFotosComoSrcMiniatura(opts.linkFotos);
  if (fromLink) return fromLink;

  const keys =
    (opts.ordemCores ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
      .length > 0
      ? (opts.ordemCores ?? []).map((c) => c.trim().toLowerCase())
      : Object.keys(opts.fotoUrlPorCor).sort();

  for (const k of keys) {
    const u = (opts.fotoUrlPorCor[k] ?? "").trim();
    if (u) return u;
  }
  for (const u of Object.values(opts.fotoUrlPorCor)) {
    const s = u.trim();
    if (s) return s;
  }
  return null;
}
