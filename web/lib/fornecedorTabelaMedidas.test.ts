import { describe, expect, it } from "vitest";
import {
  buildTabelaMedidasPayloadFromForm,
  chavesColunasTabelaMedidas,
  medidasFormToTabelaMedidas,
  medidasLinhasFromTabelaPayload,
  mergeTabelaMedidasPayload,
  padTabelaMedidasComTamanhos,
  syncMedidasLinhasComTamanhos,
  tamanhosFaltantesNaTabelaMedidas,
  tamanhosOrdenadosTabelaMedidas,
  valorTopicoFromMedida,
} from "./fornecedorTabelaMedidas";
import type { Medida } from "./fornecedorCriarVariantesRascunho";

describe("medidasFormToTabelaMedidas", () => {
  it("converte linhas e tópicos para o formato do banco", () => {
    const medidas: Medida[] = [
      { tamanho: "M", ombro: 44, comprimento: 70, extras: { Bíceps: 32 } },
    ];
    const payload = medidasFormToTabelaMedidas(
      medidas,
      ["Ombros", "Comprimento", "Bíceps"],
      "Camisa Social",
      "Camisa"
    );
    expect(payload?.tipo_produto).toBe("camisa");
    expect(payload?.medidas.M).toEqual({ ombro: 44, comprimento: 70, biceps: 32 });
  });

  it("lê Comprimento da manga gravado em extras (legado do formulário)", () => {
    const m: Medida = {
      tamanho: "M",
      extras: { "Comprimento da manga": 62 },
    };
    expect(valorTopicoFromMedida(m, "Comprimento da manga")).toBe(62);
    const payload = medidasFormToTabelaMedidas([m], ["Comprimento da manga"], "Camisa", "Camisa");
    expect(payload?.medidas.M?.manga).toBe(62);
  });

  it("sincroniza linhas com tamanhos das variações", () => {
    const linhas = syncMedidasLinhasComTamanhos(
      [{ tamanho: "M", comprimento: 70 }],
      ["P", "M", "G"]
    );
    expect(linhas.map((l) => l.tamanho)).toEqual(["P", "M", "G"]);
    expect(linhas[1].comprimento).toBe(70);
  });

  it("monta payload alinhado aos tamanhos finais", () => {
    const payload = buildTabelaMedidasPayloadFromForm(
      [{ tamanho: "M", ombro: 50 }],
      ["Ombros"],
      ["P", "M"],
      "Camisa",
      "Camisa"
    );
    expect(payload?.medidas.M).toEqual({ ombro: 50 });
    expect(payload?.medidas.P).toBeUndefined();
  });

  it("reconstrói linhas do formulário a partir do payload do banco", () => {
    const linhas = medidasLinhasFromTabelaPayload(
      {
        tipo_produto: "camisa",
        medidas: { M: { ombro: 44, comprimento: 70, biceps: 32 } },
      },
      ["Ombros", "Comprimento", "Bíceps"]
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tamanho).toBe("M");
    expect(linhas[0].ombro).toBe(44);
    expect(linhas[0].comprimento).toBe(70);
    expect(linhas[0].extras?.Bíceps).toBe(32);
  });

  it("une colunas de todas as linhas na ordem do tipo", () => {
    const keys = chavesColunasTabelaMedidas("camisa", {
      M: { busto: 50 },
      P: { ombro: 42 },
    });
    expect(keys).toEqual(["ombro", "busto"]);
  });

  it("preenche linhas vazias para tamanhos do catálogo", () => {
    const pad = padTabelaMedidasComTamanhos({ M: { busto: 50 } }, ["P", "M", "G"]);
    expect(tamanhosOrdenadosTabelaMedidas(pad)).toEqual(["P", "M", "G"]);
    expect(pad.P).toEqual({});
    expect(pad.M.busto).toBe(50);
  });

  it("mescla banco com JSON legado", () => {
    const merged = mergeTabelaMedidasPayload(
      { tipo_produto: "vestido", medidas: { M: { busto: 50 } } },
      { tipo_produto: "vestido", medidas: { M: { cintura: 40 }, P: { busto: 48 } } }
    );
    expect(merged?.medidas.M).toEqual({ cintura: 40, busto: 50 });
    expect(merged?.medidas.P).toEqual({ busto: 48 });
  });

  it("lista tamanhos sem nenhuma medida numérica", () => {
    const faltando = tamanhosFaltantesNaTabelaMedidas(
      { P: { busto: 50 }, M: {} },
      ["P", "M", "G"]
    );
    expect(faltando).toEqual(["M", "G"]);
  });
});
