/**
 * Página de informação (produto/SKU/cor/tamanho) impressa junto com a etiqueta oficial,
 * igual o formato da UpSeller — pedido do Sr Stark 2026-11-02, pra o fornecedor não precisar
 * voltar na tela pra saber o que separar antes de colar a etiqueta. Gerada no mesmo tamanho
 * físico da etiqueta (passado por quem chama), pra sair junto no mesmo rolo/impressora.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ItemInfoEtiqueta = {
  sku: string | null;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade: number;
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

export async function gerarPaginaInfoPedido(params: {
  width: number;
  height: number;
  marketplace_numero: string | null;
  seller_nome: string;
  valor_fornecedor: number;
  criado_em: string;
  itens: ItemInfoEtiqueta[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([params.width, params.height]);
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
