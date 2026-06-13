import { describe, expect, it } from "vitest";
import { formatTinyEstoqueQuantidade } from "@/lib/olistTinyApi";
import {
  estoqueOlistFromDropCore,
  skusParaSyncEstoqueOlist,
  skusParaSyncEstoqueOlistComPaiSoma,
} from "@/lib/sellerOlistSyncEstoque";
import type { CatalogSkuForOlistExport } from "@/lib/sellerCatalogOlistExport";

function sku(partial: Partial<CatalogSkuForOlistExport> & Pick<CatalogSkuForOlistExport, "sku">): CatalogSkuForOlistExport {
  return {
    id: partial.id ?? "1",
    nome_produto: partial.nome_produto ?? "Produto",
    cor: partial.cor ?? "",
    tamanho: partial.tamanho ?? "",
    status: partial.status ?? "ativo",
    categoria: partial.categoria ?? null,
    estoque_atual: partial.estoque_atual ?? null,
    custo_total: partial.custo_total ?? null,
    imagem_url: partial.imagem_url ?? null,
    link_fotos: partial.link_fotos ?? null,
    descricao: partial.descricao ?? null,
    ncm: partial.ncm ?? null,
    origem: partial.origem ?? null,
    marca: partial.marca ?? null,
    cest: partial.cest ?? null,
    peso_kg: partial.peso_kg ?? null,
    peso_liquido_kg: partial.peso_liquido_kg ?? null,
    peso_bruto_kg: partial.peso_bruto_kg ?? null,
    comprimento_cm: partial.comprimento_cm ?? null,
    largura_cm: partial.largura_cm ?? null,
    altura_cm: partial.altura_cm ?? null,
    habilitado_venda: partial.habilitado_venda ?? false,
    sku: partial.sku,
  };
}

describe("estoqueOlistFromDropCore", () => {
  it("arredonda para baixo e não negativo", () => {
    expect(estoqueOlistFromDropCore(10.9)).toBe(10);
    expect(estoqueOlistFromDropCore(-3)).toBe(0);
    expect(estoqueOlistFromDropCore(null)).toBe(0);
  });
});

describe("formatTinyEstoqueQuantidade", () => {
  it("formata inteiros sem decimal", () => {
    expect(formatTinyEstoqueQuantidade(98)).toBe("98");
  });
});

describe("skusParaSyncEstoqueOlist", () => {
  it("sincroniza filhos, não o pai interno", () => {
    const items = [
      sku({ sku: "DJU001000", estoque_atual: 0 }),
      sku({ sku: "DJU001001", estoque_atual: 5 }),
      sku({ sku: "DJU001002", estoque_atual: 3 }),
    ];
    expect(skusParaSyncEstoqueOlist(items)).toEqual(["DJU001001", "DJU001002"]);
  });

  it("inclui pai com saldo somado das variações", () => {
    const items = [
      sku({ sku: "DJU001000", estoque_atual: 0 }),
      sku({ sku: "DJU001001", estoque_atual: 50 }),
      sku({ sku: "DJU001002", estoque_atual: 50 }),
    ];
    const { skuCodes, saldoOverrides } = skusParaSyncEstoqueOlistComPaiSoma(items, "DJU001000");
    expect(skuCodes).toEqual(["DJU001000", "DJU001001", "DJU001002"]);
    expect(saldoOverrides.get("DJU001000")).toBe(100);
  });
});
