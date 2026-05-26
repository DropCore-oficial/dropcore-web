import { describe, expect, it } from "vitest";
import { medidasFormToTabelaMedidas, medidasLinhasFromTabelaPayload } from "./fornecedorTabelaMedidas";
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
});
