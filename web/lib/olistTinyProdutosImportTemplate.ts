/**
 * Cabeçalhos da planilha oficial Olist ERP (Importador de produtos → baixar planilha).
 * Modelo `produtos.xls` (64 colunas, ordem fixa). O ERP rejeita arquivo com contagem diferente.
 *
 * Não alterar nomes nem ordem — validação na importação.
 */
export const OLIST_TINY_PRODUTOS_IMPORT_HEADERS = [
  "ID",
  "Código (SKU)",
  "Descrição",
  "Unidade",
  "NCM (Classificação fiscal)",
  "Origem",
  "Preço",
  "Valor IPI fixo",
  "Observações",
  "Situação",
  "Estoque",
  "Preço de custo",
  "Cód do fornecedor",
  "Fornecedor",
  "Localização",
  "Estoque máximo",
  "Estoque mínimo",
  "Peso líquido (Kg)",
  "Peso bruto (Kg)",
  "GTIN/EAN",
  "GTIN/EAN tributável",
  "Descrição complementar",
  "CEST",
  "Código de Enquadramento IPI",
  "Formato embalagem",
  "Largura embalagem",
  "Altura Embalagem",
  "Comprimento embalagem",
  "Diâmetro embalagem",
  "Tipo do produto",
  "URL imagem 1",
  "URL imagem 2",
  "URL imagem 3",
  "URL imagem 4",
  "URL imagem 5",
  "URL imagem 6",
  "Categoria",
  "Código do pai",
  "Variações",
  "Marca",
  "Garantia",
  "Sob encomenda",
  "Preço promocional",
  "URL imagem externa 1",
  "URL imagem externa 2",
  "URL imagem externa 3",
  "URL imagem externa 4",
  "URL imagem externa 5",
  "URL imagem externa 6",
  "Link do vídeo",
  "Título SEO",
  "Descrição SEO",
  "Palavras chave SEO",
  "Slug",
  "Dias para preparação",
  "Controlar lotes",
  "Unidade por caixa",
  "URL imagem externa 7",
  "URL imagem externa 8",
  "URL imagem externa 9",
  "URL imagem externa 10",
  "Markup",
  "Permitir inclusão nas vendas",
  "EX TIPI",
] as const;

export type OlistTinyProdutosImportHeader = (typeof OLIST_TINY_PRODUTOS_IMPORT_HEADERS)[number];

export type OlistTinyProdutosImportRow = Record<OlistTinyProdutosImportHeader, string>;

export function emptyOlistTinyProdutosImportRow(): OlistTinyProdutosImportRow {
  const row = {} as OlistTinyProdutosImportRow;
  for (const h of OLIST_TINY_PRODUTOS_IMPORT_HEADERS) row[h] = "";
  return row;
}
