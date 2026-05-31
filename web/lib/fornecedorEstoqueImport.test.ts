import { describe, expect, it } from "vitest";
import {
  buildFornecedorEstoqueTemplateCsv,
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
});
