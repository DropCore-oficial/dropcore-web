import { describe, expect, it } from "vitest";
import {
  clampMensalidadeDiaVencimento,
  mensalidadeDiaVencimentoFromDataEntrada,
  vencimentoEmNoCiclo,
} from "./mensalidadeDiaVencimento";

describe("clampMensalidadeDiaVencimento", () => {
  it("limita a 1–28", () => {
    expect(clampMensalidadeDiaVencimento(0)).toBe(1);
    expect(clampMensalidadeDiaVencimento(31)).toBe(28);
    expect(clampMensalidadeDiaVencimento(6)).toBe(6);
  });
});

describe("mensalidadeDiaVencimentoFromDataEntrada", () => {
  it("lê o dia do ISO", () => {
    expect(mensalidadeDiaVencimentoFromDataEntrada("2025-05-06")).toBe(6);
  });
});

describe("vencimentoEmNoCiclo", () => {
  it("usa o dia no mês do ciclo", () => {
    expect(vencimentoEmNoCiclo("2025-05-01", 6)).toBe("2025-05-06");
  });
  it("fevereiro não ultrapassa o último dia", () => {
    expect(vencimentoEmNoCiclo("2025-02-01", 28)).toBe("2025-02-28");
    expect(vencimentoEmNoCiclo("2024-02-01", 28)).toBe("2024-02-28");
  });
});
