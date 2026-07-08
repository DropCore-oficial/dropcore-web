import { describe, expect, it } from "vitest";
import { motivoBloqueioParaOutroLado, motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";

describe("motivoBloqueioParaPortal", () => {
  it("mostra o motivo completo pro lado responsável", () => {
    expect(
      motivoBloqueioParaPortal({
        portal: "seller",
        responsavel: "seller",
        motivoCompleto: "Esta variação não está habilitada no seu plano.",
      })
    ).toBe("Esta variação não está habilitada no seu plano.");
  });

  it("mostra um texto neutro pro lado que não pode agir", () => {
    const resultado = motivoBloqueioParaPortal({
      portal: "fornecedor",
      responsavel: "seller",
      motivoCompleto: "Esta variação não está habilitada no seu plano.",
    });
    expect(resultado).not.toContain("habilitada no seu plano");
    expect(resultado).toBe(motivoBloqueioParaOutroLado("seller"));
  });

  it("retorna null se não há motivo (pedido não bloqueado)", () => {
    expect(motivoBloqueioParaPortal({ portal: "seller", responsavel: null, motivoCompleto: null })).toBeNull();
  });

  it("sem responsavel definido, mostra o motivo completo pros dois lados (compatibilidade)", () => {
    expect(
      motivoBloqueioParaPortal({ portal: "fornecedor", responsavel: null, motivoCompleto: "Fornecedor inadimplente." })
    ).toBe("Fornecedor inadimplente.");
  });
});
