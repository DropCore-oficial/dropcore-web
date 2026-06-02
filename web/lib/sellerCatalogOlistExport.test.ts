import { describe, expect, it } from "vitest";
import {
  buildOlistProdutosCsvLines,
  filterSkusByGrupo,
  filterSkusForOlistExport,
} from "./sellerCatalogOlistExport";
import { OLIST_TINY_PRODUTOS_IMPORT_HEADERS } from "./olistTinyProdutosImportTemplate";

describe("sellerCatalogOlistExport", () => {
  it("usa cabeçalhos do modelo Olist ERP (64 colunas, imagens e variações)", () => {
    expect(OLIST_TINY_PRODUTOS_IMPORT_HEADERS).toHaveLength(64);
    expect(OLIST_TINY_PRODUTOS_IMPORT_HEADERS).toContain("URL imagem externa 7");
    expect(OLIST_TINY_PRODUTOS_IMPORT_HEADERS).toContain("Código (SKU)");
    expect(OLIST_TINY_PRODUTOS_IMPORT_HEADERS).toContain("Tipo do produto");
    expect(OLIST_TINY_PRODUTOS_IMPORT_HEADERS).toContain("Variações");
  });

  it("filtra só habilitados quando scope habilitados", () => {
    const base = {
      categoria: null,
      estoque_atual: 1,
      custo_total: 10,
      imagem_url: null,
      link_fotos: null,
      descricao: null,
      ncm: null,
      origem: null,
    };
    const items = [
      { sku: "A001", nome_produto: "A", cor: "", tamanho: "", status: "ativo", habilitado_venda: true, ...base },
      { sku: "B001", nome_produto: "B", cor: "", tamanho: "", status: "ativo", habilitado_venda: false, ...base },
    ];
    expect(filterSkusForOlistExport(items, "habilitados")).toHaveLength(1);
    expect(filterSkusForOlistExport(items, "todos")).toHaveLength(2);
  });

  it("filtra por grupo pai", () => {
    const base = {
      categoria: null,
      estoque_atual: 1,
      custo_total: 10,
      imagem_url: null,
      link_fotos: null,
      descricao: null,
      ncm: null,
      origem: null,
      status: "ativo",
      nome_produto: "X",
    };
    const items = [
      { sku: "CAM000", cor: "", tamanho: "", ...base },
      { sku: "CAM001", cor: "Azul", tamanho: "M", ...base },
      { sku: "OUT001", cor: "", tamanho: "", ...base },
    ];
    const cam = filterSkusByGrupo(items, "CAM000");
    expect(cam.map((i) => i.sku).sort()).toEqual(["CAM000", "CAM001"]);
  });

  it("gera linha pai V e filho S com código do pai", () => {
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "CAM000",
        nome_produto: "Camiseta",
        cor: "",
        tamanho: "",
        status: "ativo",
        categoria: "Roupas",
        estoque_atual: 0,
        custo_total: 10,
        imagem_url: null,
        link_fotos: null,
        descricao: null,
        ncm: "61091000",
        origem: "0",
      },
      {
        sku: "CAM001",
        nome_produto: "Camiseta",
        cor: "Azul",
        tamanho: "M",
        status: "ativo",
        categoria: "Roupas",
        estoque_atual: 5,
        custo_total: 12,
        imagem_url: "https://cdn.example.com/f.jpg",
        link_fotos: null,
        descricao: "Desc",
        ncm: "61091000",
        origem: "0",
        habilitado_venda: true,
      },
    ]);
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe(OLIST_TINY_PRODUTOS_IMPORT_HEADERS.join(";"));
    const headerCount = OLIST_TINY_PRODUTOS_IMPORT_HEADERS.length;
    const paiCols = lines[1]!.split(";");
    const filhoCols = lines[2]!.split(";");
    expect(paiCols).toHaveLength(headerCount);
    expect(filhoCols).toHaveLength(headerCount);
    expect(paiCols[29]).toBe("V");
    expect(filhoCols[29]).toBe("S");
    expect(filhoCols[37]).toBe("CAM000");
    expect(filhoCols[38]).toContain("Cor:Azul");
    expect(filhoCols[30]).toBe("https://cdn.example.com/f.jpg");
    const precoIdx = OLIST_TINY_PRODUTOS_IMPORT_HEADERS.indexOf("Preço");
    const custoIdx = OLIST_TINY_PRODUTOS_IMPORT_HEADERS.indexOf("Preço de custo");
    expect(precoIdx).toBeGreaterThanOrEqual(0);
    expect(filhoCols[precoIdx]).toBe("12");
    expect(filhoCols[custoIdx]).toBe("12");
  });

  it("aplica margem de markup no preço de venda", () => {
    const lines = buildOlistProdutosCsvLines(
      [
        {
          sku: "X001",
          nome_produto: "Item",
          cor: "",
          tamanho: "",
          status: "ativo",
          categoria: null,
          estoque_atual: 1,
          custo_total: 100,
          imagem_url: null,
          link_fotos: null,
          descricao: null,
          ncm: null,
          origem: "0",
        },
      ],
      { margemPct: 50 },
    );
    const cols = lines[1]!.split(";");
    const precoIdx = OLIST_TINY_PRODUTOS_IMPORT_HEADERS.indexOf("Preço");
    expect(cols[precoIdx]).toBe("150");
  });
});
