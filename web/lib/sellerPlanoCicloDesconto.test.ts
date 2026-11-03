import { describe, expect, it } from "vitest";
import {
  calcularValorMensalSellerPlano,
  isSellerPlanoCiclo,
  isSellerPlanoDescontoTipo,
  SELLER_PLANO_CICLO_CARENCIA_DIAS,
} from "./sellerPlanoCicloDesconto";

describe("SELLER_PLANO_CICLO_CARENCIA_DIAS", () => {
  it("mensal não tem carência; semestral 30 dias; anual 60 dias", () => {
    expect(SELLER_PLANO_CICLO_CARENCIA_DIAS.mensal).toBe(0);
    expect(SELLER_PLANO_CICLO_CARENCIA_DIAS.semestral).toBe(30);
    expect(SELLER_PLANO_CICLO_CARENCIA_DIAS.anual).toBe(60);
  });
});

describe("isSellerPlanoCiclo / isSellerPlanoDescontoTipo", () => {
  it("valida valores aceitos", () => {
    expect(isSellerPlanoCiclo("mensal")).toBe(true);
    expect(isSellerPlanoCiclo("semestral")).toBe(true);
    expect(isSellerPlanoCiclo("anual")).toBe(true);
    expect(isSellerPlanoCiclo("outro")).toBe(false);
    expect(isSellerPlanoDescontoTipo("valor")).toBe(true);
    expect(isSellerPlanoDescontoTipo("percentual")).toBe(true);
    expect(isSellerPlanoDescontoTipo(null)).toBe(false);
  });
});

describe("calcularValorMensalSellerPlano", () => {
  it("sem desconto devolve o valor cheio", () => {
    expect(calcularValorMensalSellerPlano(197.9, null, null)).toBe(197.9);
    expect(calcularValorMensalSellerPlano(197.9, "valor", null)).toBe(197.9);
    expect(calcularValorMensalSellerPlano(197.9, "valor", 0)).toBe(197.9);
    expect(calcularValorMensalSellerPlano(197.9, "valor", -10)).toBe(197.9);
  });

  it("desconto em valor fixo subtrai do preço cheio", () => {
    expect(calcularValorMensalSellerPlano(197.9, "valor", 29.9)).toBe(168);
  });

  it("desconto em valor fixo nunca fica negativo", () => {
    expect(calcularValorMensalSellerPlano(97.9, "valor", 500)).toBe(0);
  });

  it("desconto percentual aplica a fração sobre o preço cheio", () => {
    expect(calcularValorMensalSellerPlano(200, "percentual", 15)).toBe(170);
  });

  it("desconto percentual é travado em 100%", () => {
    expect(calcularValorMensalSellerPlano(200, "percentual", 150)).toBe(0);
  });
});
