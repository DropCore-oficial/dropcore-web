import { describe, expect, it } from "vitest";
import { countAtualizarPrecosOk } from "./olistTinyApi";

describe("countAtualizarPrecosOk", () => {
  it("conta OK quando Olist confirma cada id", () => {
    const r = countAtualizarPrecosOk(
      [{ id: 1, preco: "35.65", sku: "DJU001000" }],
      [{ registro: { id: 1, status: "OK", preco: "35.65" } }],
    );
    expect(r.ok).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });

  it("marca falha quando id não retorna na resposta", () => {
    const r = countAtualizarPrecosOk([{ id: 99, preco: "35.65", sku: "DJU001001" }], []);
    expect(r.ok).toBe(0);
    expect(r.falhas[0]?.sku).toBe("DJU001001");
  });
});
