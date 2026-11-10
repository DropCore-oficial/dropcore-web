/**
 * Informação (produto/SKU/cor/tamanho) impressa junto com a etiqueta oficial, igual o
 * formato da UpSeller — pedido do Sr Stark 2026-11-02, pra o fornecedor não precisar voltar
 * na tela pra saber o que separar antes de colar a etiqueta.
 *
 * Achado 2026-11-02 (teste real de impressão + comparação lado a lado com PDF real da
 * UpSeller): (1) página separada antes da etiqueta fazia sair DUAS etiquetas físicas por
 * pedido (a impressora corta por página) — resolvido desenhando na própria página da
 * etiqueta. (2) UpSeller corta a margem em branco que o PDF do ML devolve e desenha uma
 * TABELA (SKU | Descrição | Variação | Qtd) embaixo da etiqueta, com a largura da folha
 * batendo com a etiqueta térmica de verdade — não uma lista de texto do lado.
 *
 * Achado 2026-11-09: pedidos cuja etiqueta ML vem com "DACE" (Declaração de Conteúdo, seção
 * nativa do ML pra certas modalidades de envio) têm conteúdo real ocupando bem mais da
 * página do que o rodapé em branco de uma etiqueta comum — um percentual fixo sobrepunha a
 * tabela em cima do texto/QR code nativos do ML. Trocado por detecção dinâmica por PDF (ver
 * `detectarTopoConteudoReal`, via pdfjs-dist): mede onde termina o conteúdo real de CADA
 * etiqueta (texto + imagem) e só desenha abaixo disso, com margem de segurança. Se não sobrar
 * espaço seguro (ex.: DACE ocupando quase a página toda), `desenharInfoPedidoNaEtiqueta`
 * devolve `false` e o chamador cai no fallback de página separada (mesmo usado pra canais
 * que não são Mercado Livre).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

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
const TABELA_SIZE = 7.5;
const TABELA_PAD_Y = 4;
const TABELA_PAD_X = 4;
const TABELA_LH = TABELA_SIZE + 2.5;

function calcularColunasTabela(larguraUtil: number) {
  const colSku = Math.round(larguraUtil * 0.19);
  const colVar = Math.round(larguraUtil * 0.22);
  const colQtd = Math.round(larguraUtil * 0.1);
  const colDesc = larguraUtil - colSku - colVar - colQtd;
  return { colSku, colDesc, colVar, colQtd };
}

/** Soma a altura que `desenharTabela` vai ocupar (header + linhas, com quebra de texto),
 * sem desenhar nada — usado pra decidir se sobra espaço seguro antes de desenhar de verdade. */
function calcularAlturaTabela(font: PDFFont, larguraUtil: number, itens: ItemInfoEtiqueta[]): number {
  const { colSku, colDesc, colVar } = calcularColunasTabela(larguraUtil);
  let altura = TABELA_LH + TABELA_PAD_Y * 2 - 2; // header

  for (const item of itens) {
    const descricao = item.nome_produto?.trim() || "Produto sem nome";
    const variacao = [item.cor, item.tamanho].filter(Boolean).join(" · ") || "—";
    const nLinhasSku = Math.max(quebrarLinha(item.sku ?? "—", font, TABELA_SIZE, colSku - TABELA_PAD_X * 2).length, 1);
    const nLinhasDesc = Math.max(quebrarLinha(descricao, font, TABELA_SIZE, colDesc - TABELA_PAD_X * 2).length, 1);
    const nLinhasVar = Math.max(quebrarLinha(variacao, font, TABELA_SIZE, colVar - TABELA_PAD_X * 2).length, 1);
    const nLinhas = Math.max(nLinhasSku, nLinhasDesc, nLinhasVar, 1);
    altura += nLinhas * TABELA_LH + TABELA_PAD_Y * 2 - 2;
  }
  return altura;
}

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
  const size = TABELA_SIZE;
  const padY = TABELA_PAD_Y;
  const padX = TABELA_PAD_X;
  const lh = TABELA_LH;

  const { colSku, colDesc, colVar, colQtd } = calcularColunasTabela(larguraUtil);
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

const CORTE_ESQUERDA = 0.2; // remove a margem em branco à esquerda da etiqueta (conteúdo começa em ~26%)
const MARGEM_SEGURANCA_TOPO = 14; // pt — buffer abaixo do Y mais baixo de conteúdo real detectado
const MARGEM_MINIMA_RODAPE = 10; // pt — sobra mínima entre o fim da tabela e a base da folha

/** Varre o conteúdo REAL de cada etiqueta (texto + imagem, incl. rotacionado) via pdfjs-dist
 * e devolve o Y (coordenada PDF, 0 = base da página) mais baixo ocupado por algo nativo do
 * PDF — ou seja, abaixo desse Y a página está garantidamente em branco NESTE pedido
 * específico. Substitui o percentual fixo medido uma única vez em 2026-11-02: etiquetas com
 * DACE (declaração de conteúdo nativa do ML) ocupam bem mais espaço que uma etiqueta comum,
 * e usar sempre o mesmo percentual fazia a tabela do DropCore cair em cima do conteúdo do
 * ML. Devolve `null` se não conseguir ler o PDF (falha de parsing) — chamador deve cair pro
 * fallback de página separada nesse caso, nunca desenhar às cegas. */
async function detectarTopoConteudoReal(bytesOriginal: Uint8Array): Promise<number | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
      data: bytesOriginal,
      disableFontFace: true,
    }).promise;
    const page = await pdf.getPage(1);

    let minY = Infinity;

    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      const textItem = item as TextItem;
      if (!textItem.transform) continue;
      // transform = [a, b, c, d, e, f]; só b/d/f entram no Y (a/c só afetam X).
      const [, b, , d, , f] = textItem.transform;
      const w = textItem.width || 0;
      const h = textItem.height || Math.hypot(b, d) || 8;
      for (const [lx, ly] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ]) {
        const py = b * lx + d * ly + f;
        if (py < minY) minY = py;
      }
    }

    const opList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const ctmStack: number[][] = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const IMAGEM_OPS = new Set([OPS.paintImageXObject, OPS.paintImageMaskXObject, OPS.paintInlineImageXObject]);

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn === OPS.save) {
        ctmStack.push(ctm);
      } else if (fn === OPS.restore) {
        ctm = ctmStack.pop() ?? ctm;
      } else if (fn === OPS.transform) {
        const [a2, b2, c2, d2, e2, f2] = opList.argsArray[i] as number[];
        ctm = [
          a2 * ctm[0] + b2 * ctm[2],
          a2 * ctm[1] + b2 * ctm[3],
          c2 * ctm[0] + d2 * ctm[2],
          c2 * ctm[1] + d2 * ctm[3],
          e2 * ctm[0] + f2 * ctm[2] + ctm[4],
          e2 * ctm[1] + f2 * ctm[3] + ctm[5],
        ];
      } else if (IMAGEM_OPS.has(fn)) {
        for (const [lx, ly] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const py = ctm[1] * lx + ctm[3] * ly + ctm[5];
          if (py < minY) minY = py;
        }
      }
    }

    return Number.isFinite(minY) ? minY : null;
  } catch (e) {
    console.error("[detectarTopoConteudoReal] falha ao analisar PDF, sem detecção dinâmica:", e);
    return null;
  }
}

/** Desenha a etiqueta no formato térmico: corta a margem em branco que o PDF do Mercado
 * Livre devolve (largura passa a bater com etiqueta térmica real) e desenha a tabela de
 * produto embaixo — igual o formato da UpSeller. 1 página só por pedido (evita sair "duas
 * etiquetas" na impressão, achado 2026-11-02).
 *
 * O limite de onde termina o conteúdo real de CADA etiqueta é medido dinamicamente por
 * pedido (`detectarTopoConteudoReal`), não é mais um percentual fixo — etiquetas com DACE
 * (declaração de conteúdo nativa do ML) ocupam mais espaço que uma etiqueta comum, e variam
 * de pedido pra pedido. Se não sobrar altura segura pra tabela na mesma página (detecção
 * falhou ou o conteúdo nativo já ocupa quase tudo), devolve `false` e quem chamou deve cair
 * no fallback de página separada (`gerarPaginaInfoPedido`) em vez de arriscar sobrepor. */
export async function desenharInfoPedidoNaEtiqueta(
  doc: PDFDocument,
  page: PDFPage,
  width: number,
  height: number,
  bytesOriginal: Uint8Array,
  params: InfoPedidoParams
): Promise<boolean> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const xMin = width * CORTE_ESQUERDA;
  const novaLargura = width - xMin;
  const marginX = xMin + 10;
  const larguraUtil = novaLargura - 20;

  const topoConteudoReal = await detectarTopoConteudoReal(bytesOriginal);
  if (topoConteudoReal == null) return false;

  const yInicial = Math.max(0, topoConteudoReal - MARGEM_SEGURANCA_TOPO);
  const alturaLinhaPedido = params.marketplace_numero ? 13 : 0;
  const alturaNecessaria = alturaLinhaPedido + calcularAlturaTabela(font, larguraUtil, params.itens);

  if (yInicial - alturaNecessaria < MARGEM_MINIMA_RODAPE) return false;

  let y = yInicial;
  if (params.marketplace_numero) {
    page.drawText(`Pedido ${params.marketplace_numero}`, { x: marginX, y, size: 7.5, font: fontBold, color: LINE_COLOR });
    y -= alturaLinhaPedido;
  }

  const yFinal = desenharTabela(page, font, fontBold, marginX, larguraUtil, y, params.itens);

  // Corta o excesso de folha em branco — a largura some à esquerda (etiqueta térmica de
  // verdade) e a altura termina logo abaixo da tabela, sem sobra embaixo.
  const yMinFinal = Math.max(0, yFinal - MARGEM_MINIMA_RODAPE);
  page.setMediaBox(xMin, yMinFinal, novaLargura, height - yMinFinal);
  page.setCropBox(xMin, yMinFinal, novaLargura, height - yMinFinal);
  return true;
}
