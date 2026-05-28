import { describe, expect, it } from "vitest";
import {
  mergeDetalhesProdutoJson,
  normalizarRaizDetalhesProduto,
  parseDetalhesProdutoJson,
  resolverDetalhesProdutoJson,
  scoreDetalhesProduto,
  skuRowDestinoDetalhesGrupo,
} from "./detalhesProdutoJson";

describe("parseDetalhesProdutoJson", () => {
  it("parseia string JSON", () => {
    const o = parseDetalhesProdutoJson('{"caracteristicas":{"tecido":"Algodão"}}');
    expect(o?.caracteristicas).toEqual({ tecido: "Algodão" });
  });
});

describe("normalizarRaizDetalhesProduto", () => {
  it("promove produto.caracteristicas para a raiz", () => {
    const n = normalizarRaizDetalhesProduto({
      produto: { caracteristicas: { tecido: "Linho" } },
    });
    expect(n.caracteristicas).toEqual({ tecido: "Linho" });
  });
});

describe("resolverDetalhesProdutoJson", () => {
  it("usa filho quando pai não tem JSON", () => {
    const d = resolverDetalhesProdutoJson(
      null,
      { caracteristicas: { composicao: "100% algodão" } }
    );
    expect(d?.caracteristicas).toEqual({ composicao: "100% algodão" });
  });

  it("ignora pai com chaves só null e usa filho preenchido", () => {
    const d = resolverDetalhesProdutoJson(
      { caracteristicas: { tecido: null, composicao: null, caimento: null } },
      { caracteristicas: { tecido: "Poliéster" } }
    );
    expect((d?.caracteristicas as { tecido?: string })?.tecido).toBe("Poliéster");
  });
});

describe("scoreDetalhesProduto", () => {
  it("retorna 0 para objeto só com null", () => {
    expect(scoreDetalhesProduto({ caracteristicas: { tecido: null, composicao: null } })).toBe(0);
  });
});

describe("mergeDetalhesProdutoJson", () => {
  it("mescla características sem apagar blocos existentes", () => {
    const m = mergeDetalhesProdutoJson(
      { guiado: { diferencial: "Leve" }, caracteristicas: { tecido: "Algodão" } },
      { caracteristicas: { composicao: "100% algodão" } }
    );
    expect(m?.guiado).toEqual({ diferencial: "Leve" });
    expect(m?.caracteristicas).toEqual({ tecido: "Algodão", composicao: "100% algodão" });
  });
});

describe("skuRowDestinoDetalhesGrupo", () => {
  it("prefere SKU pai do bloco", () => {
    const rows = [
      { sku: "DJU001001", id: "a" },
      { sku: "DJU001000", id: "b" },
    ];
    expect(skuRowDestinoDetalhesGrupo("DJU001000", rows)?.id).toBe("b");
  });

  it("cai na primeira linha sem pai", () => {
    const rows = [{ sku: "DJU001001", id: "a" }];
    expect(skuRowDestinoDetalhesGrupo("DJU001000", rows)?.id).toBe("a");
  });
});
