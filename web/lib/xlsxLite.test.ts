import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFirstSheetMatrixFromBytes } from "./xlsxLite";

describe("xlsxLite", () => {
  it("lê todas as linhas mesmo com <dimension> errado (bug real do exportador Upseller)", () => {
    // Esse arquivo tem `<dimension ref="A1"/>` mesmo com 108 linhas de dado real — libs que
    // confiam nessa tag (ex.: read-excel-file) leem só a primeira célula e descartam o resto.
    const bytes = new Uint8Array(
      fs.readFileSync(path.join(__dirname, "__fixtures__/lista-de-estoque-upseller.xlsx"))
    );
    const matrix = readFirstSheetMatrixFromBytes(bytes);

    expect(matrix.length).toBe(109); // cabeçalho + 108 linhas
    expect(matrix[0]).toEqual([
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
    ]);
    expect(matrix[1][0]).toBe("DJU005016");
    expect(matrix[1][9]).toBe(31); // Estoque Atual
    expect(matrix[matrix.length - 1][0]).toBe("DJU003001");
  });
});
