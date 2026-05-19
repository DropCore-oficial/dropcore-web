import { describe, expect, it } from "vitest";
import {
  isCalculadoraAssinaturaExpiradaLegacy403,
  isCalculadoraSemAcessoLegacy403,
  parseCalculadoraBloqueioMotivo,
} from "./calculadoraAssinaturaExpired";

describe("isCalculadoraSemAcessoLegacy403", () => {
  it("detecta 403 sem assinatura legado", () => {
    expect(
      isCalculadoraSemAcessoLegacy403(403, {
        error: "Sem acesso à calculadora. Contrate o plano ou use uma conta seller DropCore com convite.",
      }),
    ).toBe(true);
  });

  it("ignora quando já vem access", () => {
    expect(isCalculadoraSemAcessoLegacy403(403, { access: "calc_only_locked" })).toBe(false);
  });
});

describe("parseCalculadoraBloqueioMotivo", () => {
  it("parse motivos conhecidos", () => {
    expect(parseCalculadoraBloqueioMotivo({ motivo: "sem_assinatura" })).toBe("sem_assinatura");
    expect(parseCalculadoraBloqueioMotivo({ motivo: "assinatura_expirada" })).toBe("assinatura_expirada");
  });
});

describe("isCalculadoraAssinaturaExpiradaLegacy403", () => {
  it("detecta expirada legado", () => {
    expect(
      isCalculadoraAssinaturaExpiradaLegacy403(403, { error: "Assinatura da calculadora expirada. Renove para continuar." }),
    ).toBe(true);
  });
});
