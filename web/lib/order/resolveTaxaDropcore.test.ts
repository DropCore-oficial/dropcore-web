import { describe, expect, it } from "vitest";
import { resolveTaxaDropcoreUnit } from "./resolveTaxaDropcore";

describe("resolveTaxaDropcoreUnit", () => {
  it("aplica fallback de 15% sobre custo_base quando custo_dropcore está vazio/zerado", () => {
    expect(resolveTaxaDropcoreUnit(30, null)).toBeCloseTo(4.5);
    expect(resolveTaxaDropcoreUnit(30, undefined)).toBeCloseTo(4.5);
    expect(resolveTaxaDropcoreUnit(30, 0)).toBeCloseTo(4.5);
    expect(resolveTaxaDropcoreUnit(30, "0")).toBeCloseTo(4.5);
    expect(resolveTaxaDropcoreUnit(30, "")).toBeCloseTo(4.5);
  });

  it("usa custo_dropcore explícito quando maior que zero, em vez do fallback", () => {
    expect(resolveTaxaDropcoreUnit(30, 10)).toBe(10);
    expect(resolveTaxaDropcoreUnit(30, "7,50")).toBe(7.5);
  });

  it("ignora valores negativos ou inválidos em custo_dropcore e cai no fallback", () => {
    expect(resolveTaxaDropcoreUnit(30, -5)).toBeCloseTo(4.5);
    expect(resolveTaxaDropcoreUnit(30, "abc")).toBeCloseTo(4.5);
  });
});
