/**
 * Associa atributo de categoria do Mercado Livre (id/name) a um "papel" conhecido
 * (marca/modelo/material/cor/tamanho) — usado em dois lugares que precisam do mesmo
 * critério: o cadastro do fornecedor (pra saber o que pedir/pré-preencher/esconder) e a
 * publicação do seller (pra resolver Cor/Tamanho do SKU real na hora de publicar, já que
 * esses dois são por variante, não do produto como um todo — cada SKU vira um anúncio).
 */

export function normalizarTextoMl(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Acha o valor de `valoresPermitidos` que bate com o texto livre já cadastrado — comparação sem acento/caixa, não aproximada (ML não aceita valor fora da lista pra atributo tipo "list"). */
export function melhorValorPermitidoMl(textoLivre: string, valoresPermitidos: string[]): string | null {
  const alvo = normalizarTextoMl(textoLivre);
  if (!alvo) return null;
  return valoresPermitidos.find((v) => normalizarTextoMl(v) === alvo) ?? null;
}

export type PapelAtributoMl = "marca" | "modelo" | "material" | "cor" | "tamanho";

const CHAVES_POR_PAPEL: Record<PapelAtributoMl, string[]> = {
  marca: ["brand", "marca"],
  modelo: ["model", "modelo"],
  material: ["material"],
  cor: ["color", "cor"],
  tamanho: ["size", "talla", "tamanho"],
};

/** `null` quando o atributo não bate com nenhum papel conhecido (ex.: Gênero) — nesse caso não tem como auto-resolver, precisa de preenchimento manual. */
export function papelAtributoMl(attr: { id: string; name: string }): PapelAtributoMl | null {
  const idNorm = normalizarTextoMl(attr.id);
  const nameNorm = normalizarTextoMl(attr.name);
  // SIZE_GRID_ID/SIZE_GRID_ROW_ID são referência técnica a guia de tamanhos do ML (um ID de
  // catálogo, não o tamanho em si) — "size_grid_id" contém "size" e seria casado errado com
  // o papel "tamanho" sem essa exclusão, mandando "P"/"M" num campo que espera um ID técnico
  // (confirmado ao vivo 2026-11-15: ML recusa com "Attribute [SIZE_GRID_ID] is not valid").
  if (idNorm.includes("grid")) return null;
  for (const papel of Object.keys(CHAVES_POR_PAPEL) as PapelAtributoMl[]) {
    if (CHAVES_POR_PAPEL[papel].some((k) => idNorm.includes(k) || nameNorm.includes(k))) return papel;
  }
  return null;
}

/** Cor e Tamanho são por SKU/variante, não do produto pai — nunca pedidos no cadastro (ver `papelAtributoMl`), sempre resolvidos no momento da publicação a partir do SKU real. */
export function papelResolvidoNaPublicacao(papel: PapelAtributoMl | null): boolean {
  return papel === "cor" || papel === "tamanho";
}
