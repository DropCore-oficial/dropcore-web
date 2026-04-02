/**
 * Tipo de produto inferido do nome/categoria para definir colunas da tabela de medidas (estilo Shein).
 */

export type TipoProduto = "camisa" | "short" | "calca" | "vestido" | "generico";

export type ColunaMedida = { key: string; label: string };

const CAMISA: ColunaMedida[] = [
  { key: "ombro", label: "Ombro (cm)" },
  { key: "comprimento", label: "Comprimento (cm)" },
  { key: "manga", label: "Comprimento da manga (cm)" },
  { key: "busto", label: "Busto (cm)" },
  { key: "cintura", label: "Cintura (cm)" },
  { key: "quadril", label: "Quadril (cm)" },
  { key: "punho", label: "Punho (cm)" },
  { key: "biceps", label: "Bíceps (cm)" },
];

const SHORT: ColunaMedida[] = [
  { key: "cintura", label: "Cintura (cm)" },
  { key: "quadril", label: "Quadril (cm)" },
  { key: "comprimento_perna", label: "Comprimento da perna (cm)" },
  { key: "coxa", label: "Coxa (cm)" },
  { key: "cintura_barra", label: "Cintura até barra (cm)" },
];

const CALCA: ColunaMedida[] = [
  { key: "cintura", label: "Cintura (cm)" },
  { key: "quadril", label: "Quadril (cm)" },
  { key: "comprimento_perna", label: "Comprimento da perna (cm)" },
  { key: "largura_boca", label: "Largura da boca (cm)" },
  { key: "coxa", label: "Coxa (cm)" },
];

const VESTIDO: ColunaMedida[] = [
  { key: "busto", label: "Busto (cm)" },
  { key: "cintura", label: "Cintura (cm)" },
  { key: "quadril", label: "Quadril (cm)" },
  { key: "comprimento", label: "Comprimento total (cm)" },
  { key: "manga", label: "Manga (cm)" },
];

const GENERICO: ColunaMedida[] = [
  { key: "comprimento", label: "Comprimento (cm)" },
  { key: "largura", label: "Largura (cm)" },
  { key: "busto", label: "Busto (cm)" },
  { key: "cintura", label: "Cintura (cm)" },
  { key: "quadril", label: "Quadril (cm)" },
];

const TIPOS: Record<TipoProduto, ColunaMedida[]> = {
  camisa: CAMISA,
  short: SHORT,
  calca: CALCA,
  vestido: VESTIDO,
  generico: GENERICO,
};

/** Inferir tipo a partir do nome do produto e da categoria */
export function inferirTipo(nome: string, categoria: string | null): TipoProduto {
  const t = `${(nome || "").toLowerCase()} ${(categoria || "").toLowerCase()}`;
  if (/\b(camisa|camiseta|blusa|blusão)\b/.test(t)) return "camisa";
  if (/\b(short|bermuda)\b/.test(t)) return "short";
  if (/\b(calça|calca|jeans)\b/.test(t)) return "calca";
  if (/\bvestido\b/.test(t)) return "vestido";
  return "generico";
}

/** Colunas da tabela de medidas para o tipo */
export function getColunasTabelaMedidas(tipo: TipoProduto): ColunaMedida[] {
  return TIPOS[tipo] ?? GENERICO;
}
