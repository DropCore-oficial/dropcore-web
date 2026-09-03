import { describe, expect, it } from "vitest";
import { resolveTaxaDropcoreUnit } from "./resolveTaxaDropcore";
import { TAXA_DROPCORE_PERCENT } from "@/lib/taxaDropcore";

// Calcula o esperado a partir da constante real (não hardcoded) — se a % mudar de novo no
// futuro, o teste continua válido sozinho, só quebra de verdade se a fórmula quebrar.
const FALLBACK_30 = 30 * TAXA_DROPCORE_PERCENT;

describe("resolveTaxaDropcoreUnit", () => {
  it("aplica fallback de TAXA_DROPCORE_PERCENT sobre custo_base quando custo_dropcore está vazio/zerado", () => {
    expect(resolveTaxaDropcoreUnit(30, null)).toBeCloseTo(FALLBACK_30);
    expect(resolveTaxaDropcoreUnit(30, undefined)).toBeCloseTo(FALLBACK_30);
    expect(resolveTaxaDropcoreUnit(30, 0)).toBeCloseTo(FALLBACK_30);
    expect(resolveTaxaDropcoreUnit(30, "0")).toBeCloseTo(FALLBACK_30);
    expect(resolveTaxaDropcoreUnit(30, "")).toBeCloseTo(FALLBACK_30);
  });

  it("usa custo_dropcore explícito quando maior que zero, em vez do fallback", () => {
    expect(resolveTaxaDropcoreUnit(30, 10)).toBe(10);
    expect(resolveTaxaDropcoreUnit(30, "7,50")).toBe(7.5);
  });

  it("ignora valores negativos ou inválidos em custo_dropcore e cai no fallback", () => {
    expect(resolveTaxaDropcoreUnit(30, -5)).toBeCloseTo(FALLBACK_30);
    expect(resolveTaxaDropcoreUnit(30, "abc")).toBeCloseTo(FALLBACK_30);
  });
});
