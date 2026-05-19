import { describe, expect, it } from "vitest";
import { corHabilitacaoKey, paiKeySkuHabilitacao } from "./sellerSkuHabilitado";

describe("sellerSkuHabilitado — limite por cor", () => {
  it("paiKey normaliza sufixo 000", () => {
    expect(paiKeySkuHabilitacao("CAM001")).toBe("CAM000");
    expect(paiKeySkuHabilitacao("X")).toBe("X");
  });

  it("corHabilitacaoKey agrupa numerações da mesma cor", () => {
    const k = corHabilitacaoKey("DJU001001", "Branco");
    expect(k).toBe("DJU001000::BRANCO");
    expect(corHabilitacaoKey("DJU001004", "Branco")).toBe(k);
  });

  it("cores diferentes do mesmo grupo são chaves diferentes", () => {
    expect(corHabilitacaoKey("DJU001001", "Branco")).not.toBe(corHabilitacaoKey("DJU001005", "Preto"));
  });

  it("SKU de sistema não entra no contador de cores", () => {
    expect(corHabilitacaoKey("DJU999001", "Azul")).toBeNull();
  });
});
