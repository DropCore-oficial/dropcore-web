/**
 * Informação (produto/SKU/cor/tamanho) impressa junto com a etiqueta oficial, igual o
 * formato da UpSeller — pedido do Sr Stark 2026-11-02, pra o fornecedor não precisar voltar
 * na tela pra saber o que separar antes de colar a etiqueta.
 *
 * Achado 2026-11-02 (teste real de impressão + comparação lado a lado com PDF real da
 * UpSeller): (1) página separada antes da etiqueta fazia sair DUAS etiquetas físicas por
 * pedido (a impressora corta por página) — resolvido desenhando na própria página da
 * etiqueta. (2) UpSeller corta a margem em branco que o PDF do ML devolve (conteúdo real
 * começa em ~22% da largura e termina em ~51% da altura, conferido visualmente) e desenha
 * uma TABELA (SKU | Descrição | Variação | Qtd) embaixo da etiqueta, com a largura da folha
 * batendo com a etiqueta térmica de verdade — não uma lista de texto do lado. Replicado aqui
 * com folga de segurança sobre os percentuais medidos, pra nunca cortar código de barras.
 * Pra outros canais (Shopee/Shein etc., etiqueta anexada manualmente pelo seller) não temos
 * essa confirmação visual do layout, então mantém página separada por segurança.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ItemInfoEtiqueta = {
  sku: string | null;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
};

type InfoPedidoParams = {
  marketplace_numero: string | null;
  seller_nome: string;
  valor_fornecedor: number;
  criado_em: string;
  itens: ItemInfoEtiqueta[];
};

function quebrarLinha(texto: string, font: PDFFont, size: number, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (font.widthOfTextAtSize(tentativa, size) > larguraMax && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Página própria (produto/SKU antes da etiqueta) — usada pra canal que não é Mercado Livre,
 * onde não temos confirmação visual de que dá pra desenhar em cima da etiqueta sem risco. */
export async function gerarPaginaInfoPedido(params: InfoPedidoParams & { width: number; height: number }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([params.width, params.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const marginX = 14;
  const larguraUtil = params.width - marginX * 2;
  let y = params.height - 22;

  function linha(texto: string, opts: { size?: number; bold?: boolean; gap?: number; quebrar?: boolean } = {}) {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    const partes = opts.quebrar ? quebrarLinha(texto, f, size, larguraUtil) : [texto];
    for (const parte of partes) {
      if (y < 14) return;
      page.drawText(parte, { x: marginX, y, size, font: f, color: rgb(0, 0, 0) });
      y -= (opts.gap ?? size + 4);
    }
  }

  const dataFormatada = new Date(params.criado_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  linha("PRODUTO A SEPARAR", { size: 12, bold: true, gap: 18 });
  if (params.marketplace_numero) linha(`Pedido: ${params.marketplace_numero}`, { size: 9 });
  linha(`Seller: ${params.seller_nome}`, { size: 9, quebrar: true });
  linha(`Data: ${dataFormatada}  ·  Custo total: R$ ${params.valor_fornecedor.toFixed(2).replace(".", ",")}`, {
    size: 9,
    gap: 16,
  });

  for (const item of params.itens) {
    linha(item.nome_produto?.trim() || "Produto sem nome", { size: 11, bold: true, quebrar: true, gap: 15 });
    const corTamanho = [item.cor, item.tamanho].filter(Boolean).join(" · ");
    if (corTamanho) linha(corTamanho, { size: 9 });
    if (item.sku) linha(`SKU: ${item.sku}`, { size: 9 });
    linha(`Quantidade: ${item.quantidade}`, { size: 9, gap: 16 });
  }

  return doc.save();
}

const LINE_COLOR = rgb(0, 0, 0);
const LINE_WIDTH = 0.75;

/** Desenha a tabela (SKU | Descrição | Variação | Qtd) com grade, igual o formato da
 * UpSeller. Retorna o Y onde a tabela terminou (borda de baixo). */
function desenharTabela(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x: number,
  larguraUtil: number,
  startY: number,
  itens: ItemInfoEtiqueta[]
): number {
  const size = 7.5;
  const padY = 4;
  const padX = 4;
  const lh = size + 2.5;

  const colSku = Math.round(larguraUtil * 0.19);
  const colVar = Math.round(larguraUtil * 0.22);
  const colQtd = Math.round(larguraUtil * 0.1);
  const colDesc = larguraUtil - colSku - colVar - colQtd;
  const xSku = x;
  const xDesc = xSku + colSku;
  const xVar = xDesc + colDesc;
  const xQtd = xVar + colVar;
  const xFim = x + larguraUtil;

  function celula(texto: string, cx: number, cw: number, topoY: number, bold: boolean): number {
    const f = bold ? fontBold : font;
    const linhas = quebrarLinha(texto, f, size, cw - padX * 2);
    linhas.forEach((linha, i) => {
      page.drawText(linha, { x: cx + padX, y: topoY - padY - size - i * lh, size, font: f, color: LINE_COLOR });
    });
    return Math.max(linhas.length, 1);
  }

  function linhaHorizontal(y: number) {
    page.drawLine({ start: { x, y }, end: { x: xFim, y }, thickness: LINE_WIDTH, color: LINE_COLOR });
  }

  function linhasVerticais(yTopo: number, yBase: number) {
    for (const vx of [x, xDesc, xVar, xQtd, xFim]) {
      page.drawLine({ start: { x: vx, y: yTopo }, end: { x: vx, y: yBase }, thickness: LINE_WIDTH, color: LINE_COLOR });
    }
  }

  let y = startY;
  const headerAltura = lh + padY * 2 - 2;
  celula("SKU", xSku, colSku, y, true);
  celula("Descrição", xDesc, colDesc, y, true);
  celula("Variação", xVar, colVar, y, true);
  celula("Qtd", xQtd, colQtd, y, true);
  linhasVerticais(y, y - headerAltura);
  y -= headerAltura;
  linhaHorizontal(y);

  for (const item of itens) {
    const descricao = item.nome_produto?.trim() || "Produto sem nome";
    const variacao = [item.cor, item.tamanho].filter(Boolean).join(" · ") || "—";
    const nLinhasSku = Math.max(quebrarLinha(item.sku ?? "—", font, size, colSku - padX * 2).length, 1);
    const nLinhasDesc = Math.max(quebrarLinha(descricao, font, size, colDesc - padX * 2).length, 1);
    const nLinhasVar = Math.max(quebrarLinha(variacao, font, size, colVar - padX * 2).length, 1);
    const nLinhas = Math.max(nLinhasSku, nLinhasDesc, nLinhasVar, 1);
    const alturaLinha = nLinhas * lh + padY * 2 - 2;

    celula(item.sku ?? "—", xSku, colSku, y, false);
    celula(descricao, xDesc, colDesc, y, false);
    celula(variacao, xVar, colVar, y, false);
    celula(String(item.quantidade), xQtd, colQtd, y, false);
    linhasVerticais(y, y - alturaLinha);
    y -= alturaLinha;
    linhaHorizontal(y);
  }

  return y;
}

/** Desenha a etiqueta no formato térmico: corta a margem em branco que o PDF do Mercado
 * Livre devolve (largura passa a bater com etiqueta térmica real) e desenha a tabela de
 * produto embaixo — igual o formato da UpSeller. 1 página só por pedido (evita sair "duas
 * etiquetas" na impressão, achado 2026-11-02).
 *
 * Percentuais medidos de forma exata (não visual): extraídas as coordenadas reais de
 * texto/imagem/traço do PDF cru do ML via pdfjs-dist (script local, não faz parte do
 * deploy) — conteúdo real vai de ~26% a ~94% da largura e termina em ~66% da altura (de
 * baixo pra cima; só ~5% de margem no topo). Usa folga de segurança sobre esses números
 * (nunca risca em cima do código de barras, que fica acima/à direita da área cortada). */
export async function desenharInfoPedidoNaEtiqueta(
  doc: PDFDocument,
  page: PDFPage,
  width: number,
  height: number,
  params: InfoPedidoParams
): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const CORTE_ESQUERDA = 0.2; // remove a margem em branco à esquerda da etiqueta (conteúdo começa em ~26%)
  const TOPO_TABELA = 0.6; // fração da altura (de baixo pra cima) onde a etiqueta termina (~66%, com folga)

  const xMin = width * CORTE_ESQUERDA;
  const novaLargura = width - xMin;
  const marginX = xMin + 10;
  const larguraUtil = novaLargura - 20;

  let y = height * TOPO_TABELA;
  if (params.marketplace_numero) {
    page.drawText(`Pedido ${params.marketplace_numero}`, { x: marginX, y, size: 7.5, font: fontBold, color: LINE_COLOR });
    y -= 13;
  }

  const yFinal = desenharTabela(page, font, fontBold, marginX, larguraUtil, y, params.itens);

  // Corta o excesso de folha em branco — a largura some à esquerda (etiqueta térmica de
  // verdade) e a altura termina logo abaixo da tabela, sem sobra embaixo.
  const margem = 10;
  const yMinFinal = Math.max(0, yFinal - margem);
  page.setMediaBox(xMin, yMinFinal, novaLargura, height - yMinFinal);
  page.setCropBox(xMin, yMinFinal, novaLargura, height - yMinFinal);
}
