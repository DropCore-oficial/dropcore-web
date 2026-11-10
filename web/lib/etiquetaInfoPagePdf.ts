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
 * tabela em cima do texto/QR code nativos do ML. Trocado por detecção dinâmica: mede onde
 * termina o conteúdo real de CADA etiqueta (texto + imagem + traço vetorial) e desenha a
 * tabela sempre ABAIXO disso — nunca por cima, nunca em página separada (mesmo quando não
 * sobra espaço em branco, a própria página da etiqueta cresce pra baixo o quanto for preciso,
 * ver `desenharInfoPedidoNaEtiqueta`).
 *
 * Achado 2026-11-10: a primeira versão dessa detecção usava `pdfjs-dist`, mas o worker que
 * essa lib precisa pra funcionar (`pdf.worker.mjs`) some no bundle serverless da Vercel —
 * falha calada em produção ("Setting up fake worker failed" / depois "Cannot find module"),
 * nunca reproduzia local, mesmo depois de 2 tentativas de ajustar o bundling
 * (`serverExternalPackages`, `outputFileTracingIncludes`, `workerSrc` manual). Trocado por um
 * interpretador mínimo de content stream (`acharExtensaoConteudoReal`) usando só `pdf-lib`
 * (já usado em todo o resto deste arquivo) — sem worker, sem dependência nova, sem risco de
 * bundling. Validado contra o mesmo PDF real (pedido do seller Athos, com DACE): bate exato
 * com os valores que o pdfjs dava (290.27pt e 810.71pt numa página de 841.89pt).
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

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

type Mat6 = [number, number, number, number, number, number];
const MAT_IDENTIDADE: Mat6 = [1, 0, 0, 1, 0, 0];

function multiplicarMatrizes(m1: Mat6, m2: Mat6): Mat6 {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function aplicarMatriz(m: Mat6, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function decodificarConteudoDe(dict: PDFDict): string {
  const contents = dict.lookup(PDFName.of("Contents"));
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(contents.lookup(i, PDFRawStream));
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents);
  }
  return streams.map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString("latin1")).join("\n");
}

function matrizDoXObject(dict: PDFDict): Mat6 {
  const arr = dict.lookupMaybe(PDFName.of("Matrix"), PDFArray);
  if (!arr || arr.size() !== 6) return MAT_IDENTIDADE;
  const nums: number[] = [];
  for (let i = 0; i < 6; i++) nums.push((arr.get(i) as PDFNumber).asNumber());
  return nums as Mat6;
}

/** Interpreta o content stream de uma página (e recursivamente seus Form XObjects) rastreando
 * a CTM/matriz de texto pra achar o Y mínimo e máximo de todo conteúdo real desenhado —
 * texto (posição de `Td`/`TD`/`Tm`), imagem (`Do` de XObject /Image) e traço/retângulo
 * vetorial (`re`/`m`/`l`/`c`/`v`/`y`). Substitui o uso de `pdfjs-dist` (achado 2026-11-10:
 * o worker que o pdfjs precisa pra funcionar some no bundle serverless da Vercel — "Setting
 * up fake worker failed" / "Cannot find module pdf.worker.mjs", nunca reproduzia local;
 * depois de 2 tentativas de contornar isso no bundling, built com só `pdf-lib` — já usado
 * em todo o resto deste arquivo — elimina esse risco de vez). Valores batem exatamente com
 * os que o pdfjs dava antes no mesmo PDF real (pedido do seller Athos, com DACE): 290.27pt
 * e 810.71pt numa página de 841.89pt. */
function acharExtensaoConteudoReal(conteudo: string, resources: PDFDict | undefined, ctmInicial: Mat6, bounds: { min: number; max: number }, profundidade = 0): void {
  if (profundidade > 6) return;
  const n = conteudo.length;
  let i = 0;
  const operandos: number[] = [];
  let ultimoNome: string | null = null;
  const pilhaCtm: Mat6[] = [];
  let ctm = ctmInicial;
  let tlm: Mat6 = MAT_IDENTIDADE;

  const ehEspaco = (ch: string) => ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f" || ch === "\0";
  const ehDelimitador = (ch: string) => "()<>[]{}/%".includes(ch);
  const registrar = (y: number) => {
    if (y < bounds.min) bounds.min = y;
    if (y > bounds.max) bounds.max = y;
  };

  while (i < n) {
    const ch = conteudo[i];
    if (ehEspaco(ch)) {
      i++;
      continue;
    }
    if (ch === "%") {
      while (i < n && conteudo[i] !== "\n") i++;
      continue;
    }
    if (ch === "(") {
      let d = 1;
      i++;
      while (i < n && d > 0) {
        if (conteudo[i] === "\\") i += 2;
        else {
          if (conteudo[i] === "(") d++;
          else if (conteudo[i] === ")") d--;
          i++;
        }
      }
      continue;
    }
    if (ch === "<" && conteudo[i + 1] === "<") {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (conteudo[i] === "<" && conteudo[i + 1] === "<") {
          d++;
          i += 2;
        } else if (conteudo[i] === ">" && conteudo[i + 1] === ">") {
          d--;
          i += 2;
        } else i++;
      }
      continue;
    }
    if (ch === "<") {
      i++;
      while (i < n && conteudo[i] !== ">") i++;
      i++;
      continue;
    }
    if (ch === "[") {
      let d = 1;
      i++;
      while (i < n && d > 0) {
        if (conteudo[i] === "[") d++;
        else if (conteudo[i] === "]") d--;
        i++;
      }
      continue;
    }
    if (ch === "/") {
      i++;
      const start = i;
      while (i < n && !ehEspaco(conteudo[i]) && !ehDelimitador(conteudo[i])) i++;
      ultimoNome = conteudo.slice(start, i);
      continue;
    }
    if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) {
      const start = i;
      i++;
      while (
        i < n &&
        (conteudo[i] === "." || conteudo[i] === "-" || conteudo[i] === "+" || (conteudo[i] >= "0" && conteudo[i] <= "9") || conteudo[i] === "e" || conteudo[i] === "E")
      )
        i++;
      const v = parseFloat(conteudo.slice(start, i));
      if (!Number.isNaN(v)) operandos.push(v);
      continue;
    }

    const start = i;
    while (i < n && !ehEspaco(conteudo[i]) && !ehDelimitador(conteudo[i])) i++;
    const op = conteudo.slice(start, i);
    if (op.length === 0) {
      i++;
      continue;
    }

    switch (op) {
      case "q":
        pilhaCtm.push(ctm);
        break;
      case "Q":
        ctm = pilhaCtm.pop() ?? ctm;
        break;
      case "cm": {
        const m = operandos.slice(-6) as Mat6;
        ctm = multiplicarMatrizes(m, ctm);
        break;
      }
      case "re": {
        const [x, y, w, h] = operandos.slice(-4);
        for (const [lx, ly] of [
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ] as [number, number][]) {
          registrar(aplicarMatriz(ctm, lx, ly)[1]);
        }
        break;
      }
      case "m":
      case "l": {
        const [x, y] = operandos.slice(-2);
        registrar(aplicarMatriz(ctm, x, y)[1]);
        break;
      }
      case "c": {
        const [, , , , x3, y3] = operandos.slice(-6);
        registrar(aplicarMatriz(ctm, x3, y3)[1]);
        break;
      }
      case "v":
      case "y": {
        const [, , x3, y3] = operandos.slice(-4);
        registrar(aplicarMatriz(ctm, x3, y3)[1]);
        break;
      }
      case "BT":
        tlm = MAT_IDENTIDADE;
        break;
      case "Td":
      case "TD": {
        const [tx, ty] = operandos.slice(-2);
        tlm = multiplicarMatrizes([1, 0, 0, 1, tx, ty], tlm);
        registrar(aplicarMatriz(multiplicarMatrizes(tlm, ctm), 0, 0)[1]);
        break;
      }
      case "Tm": {
        tlm = operandos.slice(-6) as Mat6;
        registrar(aplicarMatriz(multiplicarMatrizes(tlm, ctm), 0, 0)[1]);
        break;
      }
      case "Do": {
        if (ultimoNome && resources) {
          const xobjDict = resources.lookupMaybe(PDFName.of("XObject"), PDFDict);
          const xobjRaw = xobjDict?.lookupMaybe(PDFName.of(ultimoNome), PDFStream);
          const xobj = xobjRaw instanceof PDFRawStream ? xobjRaw : undefined;
          if (xobj) {
            const subtype = xobj.dict.lookup(PDFName.of("Subtype"));
            const ehImagem = subtype instanceof PDFName && subtype.asString() === "/Image";
            if (ehImagem) {
              for (const [lx, ly] of [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ] as [number, number][]) {
                registrar(aplicarMatriz(ctm, lx, ly)[1]);
              }
            } else {
              const matrizForm = matrizDoXObject(xobj.dict);
              const recursosInternos = xobj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict) ?? resources;
              const conteudoInterno = Buffer.from(decodePDFRawStream(xobj).decode()).toString("latin1");
              acharExtensaoConteudoReal(conteudoInterno, recursosInternos, multiplicarMatrizes(matrizForm, ctm), bounds, profundidade + 1);
            }
          }
        }
        break;
      }
      default:
        break;
    }
    operandos.length = 0;
  }
}

/** Mede a faixa de Y (coordenada PDF, 0 = base da página) ocupada por todo conteúdo real da
 * página — abaixo de `min` e acima de `max` a página está garantidamente em branco. Devolve
 * `null` se a página não tiver `Contents` nenhum (nunca deveria acontecer numa etiqueta de
 * verdade) — quem chama trata como "não sobrou nada medido" e desenha numa área nova abaixo,
 * nunca sobrepondo. */
function detectarExtensaoConteudoReal(page: PDFPage): { min: number; max: number } | null {
  try {
    const bounds = { min: Infinity, max: -Infinity };
    const conteudo = decodificarConteudoDe(page.node);
    acharExtensaoConteudoReal(conteudo, page.node.Resources(), MAT_IDENTIDADE, bounds);
    return Number.isFinite(bounds.min) && Number.isFinite(bounds.max) ? bounds : null;
  } catch (e) {
    console.error("[detectarExtensaoConteudoReal] falha ao analisar PDF, sem detecção dinâmica:", e);
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
 * pedido (`detectarExtensaoConteudoReal`) e a tabela é desenhada logo ABAIXO dele — nunca por
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
  params: InfoPedidoParams
): Promise<boolean> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const xMin = width * CORTE_ESQUERDA;
  const novaLargura = width - xMin;
  const marginX = xMin + 10;
  const larguraUtil = novaLargura - 20;

  const conteudoReal = detectarExtensaoConteudoReal(page);
  const baseConteudo = conteudoReal?.min ?? 0;
  const topoConteudo = conteudoReal?.max ?? height;
  const yInicial = baseConteudo - MARGEM_SEGURANCA_TOPO;

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
  // Translada o conteúdo pra origem (0,0) em vez de só mover o MediaBox — MediaBox com
  // origem não-zero é válido no spec do PDF, mas impressora térmica/driver de etiqueta
  // (o uso real aqui) às vezes ignora o offset e só respeita largura/altura, fazendo sobrar
  // espaço em branco em vez de cortar de verdade.
  page.translateContent(-xMin, -yMinFinal);
  page.setMediaBox(0, 0, novaLargura, yMaxFinal - yMinFinal);
  page.setCropBox(0, 0, novaLargura, yMaxFinal - yMinFinal);
  return true;
}
