import { describe, expect, it } from "vitest";
import { medidasFormToTabelaMedidas } from "./fornecedorTabelaMedidas";
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
});
