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
  // MAIN_COLOR já tem tratamento dedicado em publicar-anuncio/route.ts (matcher mais
  // permissivo, `melhorValorPermitidoMlPorConteudo`) — "main_color" contém "color", então sem
  // essa exclusão o loop genérico de "cor" casava de novo e empurrava um 2º valor pro MESMO
  // atributo (achado real 2026-11-24, Lannabella/DJU003001: ML recusou "Attribute MAIN_COLOR
  // has too many values (2)" só pra cor "Preto", simples o bastante pra bater nos dois
  // matchers ao mesmo tempo — mesmo princípio da exclusão de SIZE_GRID_ID acima).
  if (idNorm === "main_color") return null;
  for (const papel of Object.keys(CHAVES_POR_PAPEL) as PapelAtributoMl[]) {
    if (CHAVES_POR_PAPEL[papel].some((k) => idNorm.includes(k) || nameNorm.includes(k))) return papel;
  }
  return null;
}

/** Cor e Tamanho são por SKU/variante, não do produto pai — nunca pedidos no cadastro (ver `papelAtributoMl`), sempre resolvidos no momento da publicação a partir do SKU real. */
export function papelResolvidoNaPublicacao(papel: PapelAtributoMl | null): boolean {
  return papel === "cor" || papel === "tamanho";
}

/** Acha o valor de `valoresPermitidos` cujo texto normalizado aparece DENTRO do texto livre já
 * cadastrado (ex.: "azul" dentro de "azul denim", "longa" dentro de "gola italiana manga
 * longa") — mais permissivo que `melhorValorPermitidoMl` (que exige igualdade exata). Só usar
 * em atributo opcional/não-crítico: sem match, retorna `null` e quem chama simplesmente não
 * preenche o atributo (nunca força um valor incerto). Ordena do valor mais longo pro mais
 * curto pra "colarinho italiano" não perder pra um valor genérico de 3-4 letras que por acaso
 * aparece solto no texto. */
export function melhorValorPermitidoMlPorConteudo(textoLivre: string, valoresPermitidos: string[]): string | null {
  const alvo = normalizarTextoMl(textoLivre);
  if (!alvo) return null;
  const candidatos = [...valoresPermitidos].sort((a, b) => b.length - a.length);
  return candidatos.find((v) => alvo.includes(normalizarTextoMl(v))) ?? null;
}

/** Igual `melhorValorPermitidoMlPorConteudo`, mas pra quando nem o valor do ML nem o texto
 * cadastrado contêm um ao outro por inteiro — só compartilham o "miolo" da palavra (ex.: "Gola
 * Italiana" no cadastro vs "Colarinho italiano" no ML: nenhum é substring do outro, mas
 * "italiana"/"italiano" têm o mesmo radical). Compara palavra a palavra (≥5 letras) cortando só
 * a última letra de cada uma (gênero/plural em português). Mais arriscado que os matchers
 * acima — usar só em atributo onde um match impreciso não tem consequência (não é filtro de
 * devolução nem dado financeiro). */
export function melhorValorPermitidoMlPorRadical(textoLivre: string, valoresPermitidos: string[]): string | null {
  const palavrasTexto = normalizarTextoMl(textoLivre)
    .split(/\s+/)
    .filter((w) => w.length >= 5);
  if (palavrasTexto.length === 0) return null;
  for (const valor of valoresPermitidos) {
    const palavrasValor = normalizarTextoMl(valor)
      .split(/\s+/)
      .filter((w) => w.length >= 5);
    for (const pv of palavrasValor) {
      const radical = pv.slice(0, pv.length - 1);
      if (palavrasTexto.some((pt) => pt.startsWith(radical))) return valor;
    }
  }
  return null;
}
