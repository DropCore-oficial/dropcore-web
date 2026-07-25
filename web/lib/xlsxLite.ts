/**
 * Leitor mínimo de .xlsx (1ª planilha, célula por célula) sem depender da tag `<dimension>`.
 *
 * Por quê: libs comuns (ex.: `read-excel-file`) confiam em `<dimension ref="...">` pra saber o
 * tamanho da área de dados — mas algumas ferramentas de exportação (ex.: Upseller) gravam
 * `<dimension ref="A1"/>` mesmo em planilhas com centenas de linhas reais, e essas libs então só
 * leem a primeira célula, descartando o resto silenciosamente. Aqui a gente varre as tags
 * `<row>`/`<c>` direto (regex, mesmo estilo de `fornecedorEstoqueImport.ts`), ignorando esse
 * metadado por completo.
 */
import { strFromU8, unzipSync } from "fflate";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    const texts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner))) {
      texts.push(decodeXmlEntities(tm[1]));
    }
    out.push(texts.join(""));
  }
  return out;
}

function parseSheetRows(xml: string, sharedStrings: string[]): unknown[][] {
  const rows: unknown[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowInner = rm[1];
    const row: unknown[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner))) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const letters = refMatch ? refMatch[1] : "";
      const colIdx = letters ? colLettersToIndex(letters) : row.length;
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;

      let value: unknown = null;
      if (type === "inlineStr") {
        const isInner = extractTag(inner, "is") ?? inner;
        const tInner = extractTag(isInner, "t");
        value = tInner != null ? decodeXmlEntities(tInner) : null;
      } else if (type === "s") {
        const vInner = extractTag(inner, "v");
        const idx = vInner != null ? Number(vInner) : NaN;
        value = Number.isFinite(idx) ? (sharedStrings[idx] ?? null) : null;
      } else if (type === "str") {
        const vInner = extractTag(inner, "v");
        value = vInner != null ? decodeXmlEntities(vInner) : null;
      } else if (type === "b") {
        const vInner = extractTag(inner, "v");
        value = vInner === "1";
      } else {
        const vInner = extractTag(inner, "v");
        if (vInner != null && vInner !== "") {
          const n = Number(vInner);
          value = Number.isFinite(n) ? n : vInner;
        }
      }

      while (row.length < colIdx) row.push(null);
      row[colIdx] = value;
    }
    rows.push(row);
  }
  return rows;
}

/** Lê a 1ª planilha de um `.xlsx` e devolve uma matriz (linha 0 = cabeçalho). */
export async function readFirstSheetMatrix(file: File | Blob): Promise<unknown[][]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const zip = unzipSync(buf);

  const sheetPath = Object.prototype.hasOwnProperty.call(zip, "xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : Object.keys(zip)
        .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
        .sort()[0];
  if (!sheetPath) return [];

  const sharedStrings = zip["xl/sharedStrings.xml"]
    ? parseSharedStrings(strFromU8(zip["xl/sharedStrings.xml"]))
    : [];

  return parseSheetRows(strFromU8(zip[sheetPath]), sharedStrings);
}

/** Mesma leitura, mas a partir de bytes já em mãos (útil em testes). */
export function readFirstSheetMatrixFromBytes(bytes: Uint8Array): unknown[][] {
  const zip = unzipSync(bytes);
  const sheetPath = Object.prototype.hasOwnProperty.call(zip, "xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : Object.keys(zip)
        .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
        .sort()[0];
  if (!sheetPath) return [];

  const sharedStrings = zip["xl/sharedStrings.xml"]
    ? parseSharedStrings(strFromU8(zip["xl/sharedStrings.xml"]))
    : [];

  return parseSheetRows(strFromU8(zip[sheetPath]), sharedStrings);
}
