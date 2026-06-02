import { describe, expect, it } from "vitest";
import {
  buildOlistProdutosCsvLines,
  categoriaOlist,
  filterSkusByGrupo,
  filterSkusForOlistExport,
  formatNcmOlist,
  sanitizeDescricaoOlist,
} from "./sellerCatalogOlistExport";
import { OLIST_TINY_PRODUTOS_IMPORT_HEADERS } from "./olistTinyProdutosImportTemplate";

function parseOlistCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function col(line: string, header: (typeof OLIST_TINY_PRODUTOS_IMPORT_HEADERS)[number]): string {
  const cols = parseOlistCsvLine(line);
  return cols[OLIST_TINY_PRODUTOS_IMPORT_HEADERS.indexOf(header)] ?? "";
}

describe("sellerCatalogOlistExport", () => {
  it("formata NCM, descrição e categoria no padrão Olist", () => {
    expect(formatNcmOlist("61052000")).toBe("6105.20.00");
    expect(formatNcmOlist("95030080")).toBe("9503.00.80");
    expect(sanitizeDescricaoOlist("Gola Padre | Para Os Dias Quentes")).toBe(
      "Gola Padre — Para Os Dias Quentes",
    );
    expect(categoriaOlist("Camisa Social")).toBe("");
    expect(categoriaOlist("Vestuários > Camisetas")).toBe("Vestuários > Camisetas");
  });

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
    expect(lines[0]).toBe(OLIST_TINY_PRODUTOS_IMPORT_HEADERS.map((h) => `"${h}"`).join(","));
    expect(parseOlistCsvLine(lines[1]!)).toHaveLength(OLIST_TINY_PRODUTOS_IMPORT_HEADERS.length);
    expect(col(lines[1]!, "Tipo do produto")).toBe("V");
    expect(col(lines[2]!, "Tipo do produto")).toBe("S");
    expect(col(lines[2]!, "Código do pai")).toBe("CAM000");
    expect(col(lines[2]!, "Variações")).toContain("Cor:Azul");
    expect(col(lines[2]!, "URL imagem 1")).toBe("https://cdn.example.com/f.jpg");
    expect(col(lines[1]!, "Unidade")).toBe("Un");
    expect(col(lines[1]!, "NCM (Classificação fiscal)")).toBe("6109.10.00");
    expect(col(lines[2]!, "Preço")).toBe("12,00");
    expect(col(lines[1]!, "Preço de custo")).toBe("0,00");
    expect(col(lines[2]!, "Preço de custo")).toBe("");
    expect(col(lines[2]!, "Origem")).toBe("0");
    expect(col(lines[1]!, "Categoria")).toBe("");
    expect(col(lines[1]!, "Controlar lotes")).toBe("Não");
  });

  it("remove pipe da descrição longa do fornecedor", () => {
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "DJU001000",
        nome_produto: "Gola",
        cor: "",
        tamanho: "",
        status: "ativo",
        categoria: "Camisa Social",
        estoque_atual: 0,
        custo_total: 34.5,
        imagem_url: null,
        link_fotos: null,
        descricao: "Gola Padre | Para Os Dias Quentes | Lavar A Mão",
        ncm: "61052000",
        origem: "0",
      },
      {
        sku: "DJU001001",
        nome_produto: "Gola",
        cor: "Branco",
        tamanho: "P",
        status: "ativo",
        categoria: "Camisa Social",
        estoque_atual: 1,
        custo_total: 34.5,
        imagem_url: null,
        link_fotos: null,
        descricao: "Gola Padre | Para Os Dias Quentes | Lavar A Mão",
        ncm: "61052000",
        origem: "0",
      },
    ]);
    const desc = col(lines[2]!, "Descrição");
    expect(desc).not.toContain("|");
    expect(desc).toContain("Gola Padre — Para Os Dias Quentes");
  });

  it("converte Origem Nacional para código 0", () => {
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "X001",
        nome_produto: "Item",
        cor: "",
        tamanho: "",
        status: "ativo",
        categoria: null,
        estoque_atual: 1,
        custo_total: 10,
        imagem_url: null,
        link_fotos: null,
        descricao: null,
        ncm: null,
        origem: "Nacional",
      },
    ]);
    expect(col(lines[1]!, "Origem")).toBe("0");
    expect(col(lines[1]!, "Preço")).toBe("10,00");
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
    expect(col(lines[1]!, "Preço")).toBe("150,00");
  });
});
