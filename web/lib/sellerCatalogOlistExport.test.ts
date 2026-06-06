import { describe, expect, it } from "vitest";
import {
  buildOlistProdutosCsvLines,
  categoriaOlist,
  collectLogisticaGrupo,
  filterSkusByGrupo,
  filterSkusForOlistExport,
  formatCestOlist,
  formatMedidaOlist,
  formatNcmOlist,
  mergeComLogisticaGrupo,
  sanitizeDescricaoOlist,
  urlImagemExportOlist,
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

function olistSkuBase(overrides: Partial<import("./sellerCatalogOlistExport").CatalogSkuForOlistExport> = {}) {
  return {
    categoria: null,
    estoque_atual: 1,
    custo_total: 10,
    imagem_url: null,
    link_fotos: null,
    descricao: null,
    ncm: null,
    origem: null,
    marca: null,
    cest: null,
    peso_kg: null,
    peso_liquido_kg: null,
    peso_bruto_kg: null,
    comprimento_cm: null,
    largura_cm: null,
    altura_cm: null,
    ...overrides,
  };
}

describe("sellerCatalogOlistExport", () => {
  it("formata NCM, CEST, descrição e categoria no padrão Olist", () => {
    expect(formatNcmOlist("61052000")).toBe("6105.20.00");
    expect(formatNcmOlist("95030080")).toBe("9503.00.80");
    expect(formatCestOlist("2803800")).toBe("28.038.00");
    expect(formatMedidaOlist(0.35)).toBe("0,350");
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
    const base = olistSkuBase();
    const items = [
      { sku: "A001", nome_produto: "A", cor: "", tamanho: "", status: "ativo", habilitado_venda: true, ...base },
      { sku: "B001", nome_produto: "B", cor: "", tamanho: "", status: "ativo", habilitado_venda: false, ...base },
    ];
    expect(filterSkusForOlistExport(items, "habilitados")).toHaveLength(1);
    expect(filterSkusForOlistExport(items, "todos")).toHaveLength(2);
  });

  it("filtra por grupo pai", () => {
    const base = olistSkuBase();
    const items = [
      { sku: "CAM000", cor: "", tamanho: "", status: "ativo", nome_produto: "X", ...base },
      { sku: "CAM001", cor: "Azul", tamanho: "M", status: "ativo", nome_produto: "X", ...base },
      { sku: "OUT001", cor: "", tamanho: "", status: "ativo", nome_produto: "X", ...base },
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
        ...olistSkuBase({
          categoria: "Roupas",
          estoque_atual: 0,
          ncm: "61091000",
          origem: "0",
          marca: "Insider",
          cest: "0100300",
          peso_kg: 0.25,
          comprimento_cm: 40,
          largura_cm: 15,
          altura_cm: 10,
        }),
      },
      {
        sku: "CAM001",
        nome_produto: "Camiseta",
        cor: "Azul",
        tamanho: "M",
        status: "ativo",
        habilitado_venda: true,
        ...olistSkuBase({
          categoria: "Roupas",
          estoque_atual: 5,
          custo_total: 12,
          imagem_url: "https://cdn.example.com/f.jpg",
          descricao: "Desc longa do produto",
          ncm: "61091000",
          origem: "0",
        }),
      },
    ]);
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe(OLIST_TINY_PRODUTOS_IMPORT_HEADERS.map((h) => `"${h}"`).join(","));
    expect(parseOlistCsvLine(lines[1]!)).toHaveLength(OLIST_TINY_PRODUTOS_IMPORT_HEADERS.length);
    expect(col(lines[1]!, "Tipo do produto")).toBe("V");
    expect(col(lines[2]!, "Tipo do produto")).toBe("S");
    expect(col(lines[2]!, "Código do pai")).toBe("CAM000");
    expect(col(lines[2]!, "Variações")).toContain("Cor:Azul");
    expect(col(lines[1]!, "URL imagem 1")).toBe("https://cdn.example.com/f.jpg");
    expect(col(lines[2]!, "URL imagem 1")).toBe("");
    expect(col(lines[1]!, "Unidade")).toBe("Un");
    expect(col(lines[1]!, "NCM (Classificação fiscal)")).toBe("6109.10.00");
    expect(col(lines[2]!, "Preço")).toBe("0,00");
    expect(col(lines[1]!, "Preço")).toBe("0,00");
    expect(col(lines[1]!, "Preço de custo")).toBe("12,00");
    expect(col(lines[2]!, "Preço de custo")).toBe("12,00");
    expect(col(lines[2]!, "Origem")).toBe("0");
    expect(col(lines[1]!, "Categoria")).toBe("");
    expect(col(lines[1]!, "Controlar lotes")).toBe("Não");
    expect(col(lines[1]!, "Marca")).toBe("Insider");
    expect(col(lines[1]!, "CEST")).toBe("01.003.00");
    expect(col(lines[1]!, "Peso líquido (Kg)")).toBe("0,250");
    expect(col(lines[1]!, "Formato embalagem")).toBe("Pacote / Caixa");
    expect(col(lines[1]!, "Descrição complementar")).toBe("Desc longa do produto");
    expect(col(lines[2]!, "Descrição complementar")).toBe("");
  });

  it("rejeita data URL base64 e mantém CSV leve", () => {
    const b64 = `data:image/jpeg;base64,${"A".repeat(50000)}`;
    expect(urlImagemExportOlist(b64)).toBeNull();
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "CAM000",
        nome_produto: "Camiseta",
        cor: "",
        tamanho: "",
        status: "ativo",
        ...olistSkuBase({ estoque_atual: 0, imagem_url: b64 }),
      },
      {
        sku: "CAM001",
        nome_produto: "Camiseta",
        cor: "Azul",
        tamanho: "M",
        status: "ativo",
        ...olistSkuBase({ imagem_url: b64 }),
      },
    ]);
    expect(col(lines[1]!, "URL imagem 1")).toBe("");
    expect(lines.join("\n").length).toBeLessThan(500_000);
  });

  it("aceita URL Supabase storage e herda fotos do grupo no pai", () => {
    const supa = "https://abc.supabase.co/storage/v1/object/public/fotos/cam.jpg";
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "CAM000",
        nome_produto: "Camiseta",
        cor: "",
        tamanho: "",
        status: "ativo",
        ...olistSkuBase({ estoque_atual: 0 }),
      },
      {
        sku: "CAM001",
        nome_produto: "Camiseta",
        cor: "Azul",
        tamanho: "M",
        status: "ativo",
        ...olistSkuBase({ imagem_url: supa }),
      },
    ]);
    expect(col(lines[1]!, "URL imagem 1")).toBe(supa);
    expect(col(lines[2]!, "URL imagem 1")).toBe("");
  });

  it("separa título e descrição complementar", () => {
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "DJU001000",
        nome_produto: "Gola Padre",
        cor: "",
        tamanho: "",
        status: "ativo",
        ...olistSkuBase({
          categoria: "Camisa Social",
          estoque_atual: 0,
          custo_total: 34.5,
          descricao: "Gola Padre | Para Os Dias Quentes | Lavar A Mão",
          ncm: "61052000",
          origem: "0",
        }),
      },
      {
        sku: "DJU001001",
        nome_produto: "Gola Padre",
        cor: "Branco",
        tamanho: "P",
        status: "ativo",
        ...olistSkuBase({
          categoria: "Camisa Social",
          estoque_atual: 1,
          custo_total: 34.5,
          descricao: "Gola Padre | Para Os Dias Quentes | Lavar A Mão",
          ncm: "61052000",
          origem: "0",
        }),
      },
    ]);
    expect(col(lines[2]!, "Descrição")).toBe("Gola Padre");
    const compPai = col(lines[1]!, "Descrição complementar");
    expect(compPai).toContain("Gola Padre — Para Os Dias Quentes");
    expect(col(lines[2]!, "Descrição complementar")).toBe("");
  });

  it("converte Origem Nacional para código 0", () => {
    const lines = buildOlistProdutosCsvLines([
      {
        sku: "X000",
        nome_produto: "Item",
        cor: "",
        tamanho: "",
        status: "ativo",
        ...olistSkuBase({ estoque_atual: 0, origem: "Nacional" }),
      },
      {
        sku: "X001",
        nome_produto: "Item",
        cor: "Azul",
        tamanho: "M",
        status: "ativo",
        ...olistSkuBase({ origem: "Nacional" }),
      },
    ]);
    expect(col(lines[2]!, "Origem")).toBe("0");
    expect(col(lines[2]!, "Preço")).toBe("0,00");
    expect(col(lines[2]!, "Preço de custo")).toBe("10,00");
  });

  it("aplica margem de markup no preço de custo", () => {
    const lines = buildOlistProdutosCsvLines(
      [
        {
          sku: "X000",
          nome_produto: "Item",
          cor: "",
          tamanho: "",
          status: "ativo",
          ...olistSkuBase({ estoque_atual: 0, custo_total: 100, origem: "0" }),
        },
        {
          sku: "X001",
          nome_produto: "Item",
          cor: "Azul",
          tamanho: "M",
          status: "ativo",
          ...olistSkuBase({ custo_total: 100, origem: "0" }),
        },
      ],
      { margemPct: 50 },
    );
    expect(col(lines[2]!, "Preço")).toBe("0,00");
    expect(col(lines[2]!, "Preço de custo")).toBe("150,00");
  });

  it("herda peso e fiscal do representante/filho no pai e nas variações sem dado próprio", () => {
    const basePai = {
      sku: "DJU001000",
      nome_produto: "Gola Padre",
      cor: "",
      tamanho: "",
      status: "ativo",
      ...olistSkuBase({
        estoque_atual: 0,
        custo_total: 34.5,
        cest: "2803800",
        comprimento_cm: 20,
        largura_cm: 5,
        altura_cm: 15,
      }),
    };
    const baseFilho = {
      sku: "DJU001001",
      nome_produto: "Gola Padre",
      cor: "Branco",
      tamanho: "P",
      status: "ativo",
      ...olistSkuBase({
        estoque_atual: 8,
        custo_total: 34.5,
        ncm: "61052000",
        origem: "0",
        marca: "Djulios",
        peso_liquido_kg: 0.35,
        peso_bruto_kg: 0.38,
      }),
    };
    const lines = buildOlistProdutosCsvLines([basePai, baseFilho]);
    expect(col(lines[1]!, "Peso líquido (Kg)")).toBe("0,350");
    expect(col(lines[1]!, "Peso bruto (Kg)")).toBe("0,380");
    expect(col(lines[1]!, "NCM (Classificação fiscal)")).toBe("6105.20.00");
    expect(col(lines[1]!, "Marca")).toBe("Djulios");
    expect(col(lines[1]!, "Comprimento embalagem")).toBe("20,0");
    expect(col(lines[2]!, "Peso líquido (Kg)")).toBe("0,350");
    expect(col(lines[2]!, "NCM (Classificação fiscal)")).toBe("6105.20.00");
  });

  it("collectLogisticaGrupo e mergeComLogisticaGrupo preenchem lacunas do SKU", () => {
    const pai = {
      sku: "DJU001000",
      nome_produto: "Gola Padre",
      cor: "",
      tamanho: "",
      status: "ativo",
      ...olistSkuBase({ comprimento_cm: 20, largura_cm: 5, altura_cm: 15 }),
    };
    const filho = {
      sku: "DJU001001",
      nome_produto: "Gola Padre",
      cor: "Branco",
      tamanho: "P",
      status: "ativo",
      ...olistSkuBase({ peso_liquido_kg: 0.35, ncm: "61052000", marca: "Djulios" }),
    };
    const grupo = collectLogisticaGrupo(pai, [filho]);
    expect(grupo.peso_liquido_kg).toBe(0.35);
    expect(grupo.comprimento_cm).toBe(20);
    expect(grupo.ncm).toBe("61052000");
    const mergedPai = mergeComLogisticaGrupo(pai, grupo);
    expect(mergedPai.peso_liquido_kg).toBe(0.35);
    expect(mergedPai.comprimento_cm).toBe(20);
    expect(mergedPai.ncm).toBe("61052000");
  });
});
