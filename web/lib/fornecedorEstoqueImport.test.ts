import { describe, expect, it } from "vitest";
import {
  buildFornecedorEstoqueTemplateCsv,
  fornecedorEstoqueRowsFromPlanilhaMatrix,
  normalizeFornecedorEstoqueImportRow,
  parseFornecedorEstoqueCsv,
} from "./fornecedorEstoqueImport";

describe("fornecedorEstoqueImport", () => {
  it("parseia CSV com cabeçalhos pt-BR", () => {
    const csv = "SKU;Estoque atual;Est. mínimo\nabc001001;10;5\n";
    const rows = parseFornecedorEstoqueCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("abc001001");
    expect(rows[0].estoque_atual).toBe("10");
    expect(rows[0].estoque_minimo).toBe("5");
  });

  it("normaliza SKU em maiúsculas e números com vírgula", () => {
    const row = normalizeFornecedorEstoqueImportRow({
      sku: " dju001002 ",
      estoque_atual: "12,5",
    });
    expect(row).toEqual({ sku: "DJU001002", estoque_atual: 12.5 });
  });

  it("ignora linha sem coluna de estoque", () => {
    expect(normalizeFornecedorEstoqueImportRow({ sku: "X" })).toBeNull();
  });

  it("gera modelo com BOM e cabeçalho", () => {
    const csv = buildFornecedorEstoqueTemplateCsv();
    expect(csv.startsWith("\uFEFFSKU;Estoque atual;Est. mínimo")).toBe(true);
    expect(csv).toContain("ABC001001");
  });

  it("lê planilha 'Lista de Estoque' exportada da Olist/Tiny (colunas extras ignoradas)", () => {
    const matrix: unknown[][] = [
      [
        "SKU",
        "Título",
        "Armazém",
        "Estante",
        "Estoque Baixo",
        "Em Trânsito(Compra)",
        "Em Trânsito(Transferência）",
        "Ocupado",
        "Disponível",
        "Estoque Atual",
        "Custo Médio",
        "Subtotal",
        "Criado",
      ],
      [
        "DJU005016",
        "Cinza - GG Camisa gola Italiana tectel manga longa",
        "My Warehouse",
        null,
        0,
        0,
        0,
        0,
        31,
        31,
        null,
        null,
        "2026-07-09 17:14:30",
      ],
    ];
    const rows = fornecedorEstoqueRowsFromPlanilhaMatrix(matrix);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("DJU005016");
    expect(rows[0].estoque_atual).toBe(31);
    const normalized = normalizeFornecedorEstoqueImportRow(rows[0]);
    expect(normalized).toEqual({ sku: "DJU005016", estoque_atual: 31 });
  });

  it("ignora matriz vazia ou só com cabeçalho", () => {
    expect(fornecedorEstoqueRowsFromPlanilhaMatrix([])).toEqual([]);
    expect(fornecedorEstoqueRowsFromPlanilhaMatrix([["SKU", "Estoque Atual"]])).toEqual([]);
  });
});
