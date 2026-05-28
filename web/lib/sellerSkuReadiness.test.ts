import { describe, expect, it } from "vitest";
import { corGrupoTemEstoqueParaHabilitar, skuTemEstoquePositivo } from "./sellerSkuReadiness";

describe("estoque por cor para habilitar venda", () => {
  it("cor com P e M em estoque pode ligar mesmo com G e GG zerados", () => {
    const cor = [
      { estoque_atual: 100 },
      { estoque_atual: 200 },
      { estoque_atual: 0 },
      { estoque_atual: 0 },
    ];
    expect(corGrupoTemEstoqueParaHabilitar(cor)).toBe(true);
  });

  it("cor com todos os tamanhos zerados não pode ligar", () => {
    const cor = [
      { estoque_atual: 0 },
      { estoque_atual: 0 },
      { estoque_atual: 0 },
    ];
    expect(corGrupoTemEstoqueParaHabilitar(cor)).toBe(false);
  });

  it("skuTemEstoquePositivo", () => {
    expect(skuTemEstoquePositivo(1)).toBe(true);
    expect(skuTemEstoquePositivo(0)).toBe(false);
    expect(skuTemEstoquePositivo(null)).toBe(false);
  });
});
