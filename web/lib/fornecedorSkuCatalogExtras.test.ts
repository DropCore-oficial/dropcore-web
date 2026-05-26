import { describe, expect, it } from "vitest";
import { fornecedorSkuCatalogExtrasFromBody, ncmOrigemFromSkuRow } from "./fornecedorSkuCatalogExtras";

describe("fornecedorSkuCatalogExtrasFromBody", () => {
  it("lê colunas do corpo e fallback em logistica", () => {
    const extras = fornecedorSkuCatalogExtrasFromBody({
      categoria: "Camiseta",
      ncm: "6109.10.00",
      origem: "0",
      detalhes_produto_json: {
        logistica: { cest: "28.038.00", cfop: "5102", cdSaida: "CD SP" },
      },
    });
    expect(extras.categoria).toBe("Camiseta");
    expect(extras.ncm).toBe("6109.10.00");
    expect(extras.origem).toBe("0");
    expect(extras.cest).toBe("28.038.00");
    expect(extras.cfop).toBe("5102");
    expect(extras.expedicao_override_linha).toBe("CD SP");
  });

  it("ncmOrigemFromSkuRow usa JSON quando colunas vazias", () => {
    const row = ncmOrigemFromSkuRow({
      ncm: null,
      origem: null,
      detalhes_produto_json: {
        logistica: { ncm: "6105.20.00", origemProduto: "0" },
      },
    });
    expect(row.ncm).toBe("6105.20.00");
    expect(row.origem).toBe("0");
  });
});
