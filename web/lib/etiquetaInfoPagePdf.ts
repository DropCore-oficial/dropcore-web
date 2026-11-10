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
 * etiqueta (texto + imagem) e desenha a tabela sempre ABAIXO disso — nunca por cima, nunca em
 * página separada (mesmo quando não sobra espaço em branco, a própria página da etiqueta
 * cresce pra baixo o quanto for preciso, ver `desenharInfoPedidoNaEtiqueta`).
 *
 * Bug corrigido no mesmo dia (pedido real do seller Athos, canal ML, com DACE): a primeira
 * versão de `detectarTopoConteudoReal` projetava os cantos do texto multiplicando a largura
 * pelos componentes BRUTOS da matriz de transformação (`b * largura`) — como essa matriz já
 * vem com o tamanho da fonte embutido (não é uma rotação pura), isso aplicava a escala DUAS
 * vezes e dava um Y absurdo (ex.: -1257 numa página de 841pt), fazendo o código achar que não
 * sobrava espaço nenhum e cair num fallback de página separada que não devia mais existir.
 * Corrigido projetando por ÂNGULO de rotação (vetor unitário) em vez da matriz bruta — `width`/
 * `height` do pdfjs já vêm na magnitude certa, só falta a direção.
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
const MARGEM_SEGURANCA_TOPO = 6; // pt — buffer entre o conteúdo real mais baixo e a tabela do DropCore
const MARGEM_MINIMA_RODAPE = 6; // pt — sobra mínima entre o fim da tabela e a base da folha
const MARGEM_CORTE_TOPO = 6; // pt — sobra mínima entre o topo do conteúdo real e o topo da folha

/** Varre o conteúdo REAL de cada etiqueta (texto, imagem e traço/retângulo vetorial — ex.:
 * borda da caixa do DACE —, incl. rotacionado) via pdfjs-dist e devolve a faixa de Y
 * (coordenada PDF, 0 = base da página) ocupada por algo nativo do PDF — abaixo de `min` e
 * acima de `max` a página está garantidamente em branco NESTE pedido específico. Substitui o
 * percentual fixo medido uma única vez em 2026-11-02: etiquetas com DACE (declaração de
 * conteúdo nativa do ML) ocupam bem mais espaço que uma etiqueta comum, e usar sempre o mesmo
 * percentual fazia a tabela do DropCore cair em cima do conteúdo do ML. Devolve `null` se não
 * conseguir ler o PDF (falha de parsing) — quem chama trata como "não sobrou nada medido", e
 * ainda assim desenha numa área nova abaixo (nunca sobrepõe, só não aproveita espaço que não
 * deu pra confirmar). */
async function detectarTopoConteudoReal(bytesOriginal: Uint8Array): Promise<{ min: number; max: number } | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
      data: bytesOriginal,
      disableFontFace: true,
    }).promise;
    const page = await pdf.getPage(1);

    let minY = Infinity;
    let maxY = -Infinity;

    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      const textItem = item as TextItem;
      if (!textItem.transform) continue;
      // transform = [a, b, c, d, e, f] já vem com o tamanho da fonte embutido em a/b/c/d — e
      // `width`/`height` do pdfjs já são o tamanho final (em pt de página), não "unidades de
      // glifo" a escalar de novo. Projetar os cantos locais (w, h) direto pelos componentes
      // brutos da matriz (`b*lx`) multiplicava a largura pela escala DUAS vezes (achado
      // 2026-11-09, pedido real do Athos: dava Y=-1257 numa página de 841pt) — tinha que usar
      // só o ÂNGULO de rotação da matriz (vetor unitário) pra combinar com w/h, que já carregam
      // a magnitude certa.
      const [a, b] = textItem.transform;
      const f = textItem.transform[5];
      const angle = Math.atan2(b, a);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const w = textItem.width || 0;
      const h = textItem.height || Math.hypot(textItem.transform[1], textItem.transform[3]) || 8;
      for (const [lx, ly] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ]) {
        const py = f + lx * sinA + ly * cosA;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
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
        if (py > maxY) maxY = py;
        }
      } else if (fn === OPS.constructPath) {
        // Traço/retângulo vetorial (ex.: borda da caixa do DACE) — pdfjs já devolve a bounding
        // box local em `argsArray[i][2]` como [minX, minY, maxX, maxY]. Achado 2026-11-09: sem
        // isso, a borda da caixa do DACE ficava um pouco abaixo do texto mais baixo detectado
        // (~12pt no pedido real do Athos), e a margem de segurança não cobria essa diferença —
        // a linha "Pedido X" saía desenhada em cima da borda.
        const bbox = opList.argsArray[i]?.[2] as Record<number, number> | undefined;
        if (bbox) {
          for (const [lx, ly] of [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[0], bbox[3]],
            [bbox[2], bbox[3]],
          ]) {
            const py = ctm[1] * lx + ctm[3] * ly + ctm[5];
            if (py < minY) minY = py;
        if (py > maxY) maxY = py;
          }
        }
      }
    }

    return Number.isFinite(minY) && Number.isFinite(maxY) ? { min: minY, max: maxY } : null;
  } catch (e) {
    console.error("[detectarTopoConteudoReal] falha ao analisar PDF, sem detecção dinâmica:", e);
    return null;
  }
}

/** Desenha a etiqueta no formato térmico: corta a margem em branco que o PDF do Mercado
 * Livre devolve (largura passa a bater com etiqueta térmica real) e desenha a tabela de
 * produto embaixo — igual o formato da UpSeller. SEMPRE 1 página só por pedido (nunca cai
 * pra página separada — achado 2026-11-02: impressora corta por página, então 2 páginas
 * viram 2 etiquetas físicas).
 *
 * O limite de onde termina o conteúdo real de CADA etiqueta é medido dinamicamente por
 * pedido (`detectarTopoConteudoReal`) e a tabela é desenhada logo ABAIXO dele — nunca por
 * cima. Quando sobra espaço em branco na página original, usa esse espaço e corta o excesso
 * (sem desperdício). Quando NÃO sobra (ex.: DACE ocupando quase a página toda), a página da
 * própria etiqueta cresce pra baixo (MediaBox com Y negativo) só o necessário pra tabela
 * caber — ainda assim 1 página só, nunca duas. Se a detecção falhar (PDF não deu pra
 * analisar), assume o pior caso (conteúdo até a base) e já desenha na área nova estendida,
 * garantindo que nunca sobrepõe algo que não foi possível medir. */
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

  const conteudoReal = await detectarTopoConteudoReal(bytesOriginal);
  const baseConteudo = conteudoReal?.min ?? 0;
  const topoConteudo = conteudoReal?.max ?? height;
  const yInicial = baseConteudo - MARGEM_SEGURANCA_TOPO;
  // DEBUG TEMPORÁRIO 2026-11-09 — remover depois de confirmar a causa do vão em produção
  // (local não reproduz, suspeita de diferença de runtime do pdfjs-dist no bundle Vercel).
  console.error("[etiqueta-debug]", JSON.stringify({ width, height, conteudoReal, baseConteudo, topoConteudo, yInicial }));

  let y = yInicial;
  if (params.marketplace_numero) {
    page.drawText(`Pedido ${params.marketplace_numero}`, { x: marginX, y, size: 7.5, font: fontBold, color: LINE_COLOR });
    y -= 13;
  }

  const yFinal = desenharTabela(page, font, fontBold, marginX, larguraUtil, y, params.itens);

  // Corta o excesso de folha em branco dos 4 lados — esquerda (margem fixa do PDF do ML),
  // topo e base (logo acima/abaixo do conteúdo real detectado, sem desperdiçar o que já é
  // naturalmente em branco na etiqueta original). Quando a tabela coube dentro da página
  // original, `yMinFinal` fica positivo (crop tradicional). Quando não coube, fica negativo —
  // o MediaBox estende a página pra baixo só o suficiente pra tabela caber, mantendo 1 página
  // só em vez de criar uma segunda.
  const yMinFinal = yFinal - MARGEM_MINIMA_RODAPE;
  const yMaxFinal = Math.min(height, topoConteudo + MARGEM_CORTE_TOPO);
  console.error("[etiqueta-debug]", JSON.stringify({ yFinal, yMinFinal, yMaxFinal, alturaFinal: yMaxFinal - yMinFinal }));
  // Translada o conteúdo pra origem (0,0) em vez de só mover o MediaBox — MediaBox com
  // origem não-zero é válido no spec do PDF, mas impressora térmica/driver de etiqueta
  // (o uso real aqui) às vezes ignora o offset e só respeita largura/altura, fazendo sobrar
  // espaço em branco em vez de cortar de verdade.
  page.translateContent(-xMin, -yMinFinal);
  page.setMediaBox(0, 0, novaLargura, yMaxFinal - yMinFinal);
  page.setCropBox(0, 0, novaLargura, yMaxFinal - yMinFinal);
  return true;
}
