/** Importação CSV de estoque no portal do fornecedor (SKU + quantidades). */

export const FORNECEDOR_ESTOQUE_IMPORT_MAX_ROWS = 5000;

export const FORNECEDOR_ESTOQUE_CSV_HEADERS = ["SKU", "Estoque atual", "Est. mínimo"] as const;

const CSV_HEADER_TO_KEY: Record<string, "sku" | "estoque_atual" | "estoque_minimo"> = {
  SKU: "sku",
  sku: "sku",
  "Estoque atual": "estoque_atual",
  estoque_atual: "estoque_atual",
  "Estoque Atual": "estoque_atual",
  estoque: "estoque_atual",
  Estoque: "estoque_atual",
  "Est. mínimo": "estoque_minimo",
  "Est. minimo": "estoque_minimo",
  estoque_minimo: "estoque_minimo",
  "Estoque mínimo": "estoque_minimo",
  "Estoque minimo": "estoque_minimo",
};

export type FornecedorEstoqueImportRow = {
  sku: string;
  estoque_atual?: number | null;
  estoque_minimo?: number | null;
};

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse CSV com ; e campos entre aspas (Excel pt-BR). */
export function parseFornecedorEstoqueCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers: string[] = [];
  let i = 0;
  while (i < headerLine.length) {
    if (headerLine[i] === '"') {
      let end = i + 1;
      while (end < headerLine.length) {
        if (headerLine[end] === '"' && headerLine[end + 1] !== '"') break;
        if (headerLine[end] === '"') end += 2;
        else end++;
      }
      headers.push(headerLine.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 1;
      if (headerLine[i] === ";") i++;
    } else {
      const semi = headerLine.indexOf(";", i);
      const end = semi === -1 ? headerLine.length : semi;
      headers.push(headerLine.slice(i, end).trim());
      i = semi === -1 ? headerLine.length : semi + 1;
    }
  }

  const keys = headers.map((h) => CSV_HEADER_TO_KEY[h.trim()] ?? null);
  const rows: Record<string, unknown>[] = [];

  for (let L = 1; L < lines.length; L++) {
    const line = lines[L];
    const values: string[] = [];
    let j = 0;
    while (j < line.length) {
      if (line[j] === '"') {
        let end = j + 1;
        while (end < line.length) {
          if (line[end] === '"' && line[end + 1] !== '"') break;
          if (line[end] === '"') end += 2;
          else end++;
        }
        values.push(line.slice(j + 1, end).replace(/""/g, '"'));
        j = end + 1;
        if (line[j] === ";") j++;
      } else {
        const semi = line.indexOf(";", j);
        const end = semi === -1 ? line.length : semi;
        values.push(line.slice(j, end).trim());
        j = semi === -1 ? line.length : semi + 1;
      }
    }

    const row: Record<string, unknown> = {};
    keys.forEach((k, idx) => {
      if (!k || values[idx] === undefined) return;
      row[k] = values[idx] === "" ? null : values[idx];
    });
    if (row.sku) rows.push(row);
  }

  return rows;
}

export function normalizeFornecedorEstoqueImportRow(
  row: Record<string, unknown>
): FornecedorEstoqueImportRow | null {
  const skuRaw = typeof row.sku === "string" ? row.sku.trim().toUpperCase() : "";
  if (!skuRaw) return null;

  const hasEstoque = "estoque_atual" in row;
  const hasMinimo = "estoque_minimo" in row;
  if (!hasEstoque && !hasMinimo) return null;

  const out: FornecedorEstoqueImportRow = { sku: skuRaw };
  if (hasEstoque) out.estoque_atual = parseNum(row.estoque_atual);
  if (hasMinimo) out.estoque_minimo = parseNum(row.estoque_minimo);
  return out;
}

function csvCampo(val: string | number | null | undefined): string {
  const s = val == null ? "" : String(val);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Modelo vazio para o fornecedor preencher no Excel. */
export function buildFornecedorEstoqueTemplateCsv(): string {
  const header = FORNECEDOR_ESTOQUE_CSV_HEADERS.join(";");
  const exemplo = ["ABC001001", "120", "50"].map(csvCampo).join(";");
  return `\uFEFF${header}\n${exemplo}\n`;
}

export type FornecedorEstoqueExportItem = {
  sku: string;
  estoque_atual: number | null;
  estoque_minimo: number | null;
};

/** Exporta estoque atual do catálogo (para editar e reimportar). */
export function buildFornecedorEstoqueExportCsv(items: FornecedorEstoqueExportItem[]): string {
  const header = FORNECEDOR_ESTOQUE_CSV_HEADERS.join(";");
  const linhas = items
    .slice()
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((item) =>
      [item.sku, item.estoque_atual ?? "", item.estoque_minimo ?? ""].map(csvCampo).join(";")
    );
  return `\uFEFF${header}\n${linhas.join("\n")}\n`;
}
