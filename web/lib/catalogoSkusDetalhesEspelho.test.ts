import { describe, expect, it } from "vitest";
import { grupoKeyFromSku, propagarDetalhesProdutoJsonNoGrupo } from "./detalhesProdutoJson";
import { prepararDetalhesProdutoJsonCatalogo } from "./catalogoSkusDetalhesEspelho";

describe("espelho catalogo seller/fornecedor", () => {
  it("propaga detalhes do pai inativo para variantes ativas", () => {
    const paiSku = "DJU002000";
    const detalhes = {
      caracteristicas: { tecido: "Dunas", caimento: "regular" },
      infoBasica: { modelo: "Gola Padre" },
    };
    const rows = [
      { id: "1", sku: paiSku, status: "inativo", detalhes_produto_json: detalhes },
      { id: "2", sku: "DJU002001", status: "ativo", detalhes_produto_json: null },
      { id: "3", sku: "DJU002002", status: "ativo", detalhes_produto_json: null },
    ];
    const propagados = propagarDetalhesProdutoJsonNoGrupo(rows);
    const ativos = propagados.filter((r) => r.status === "ativo");
    expect(ativos).toHaveLength(2);
    for (const v of ativos) {
      expect((v.detalhes_produto_json as { caracteristicas?: { tecido?: string } })?.caracteristicas?.tecido).toBe(
        "Dunas"
      );
    }
    expect(grupoKeyFromSku("DJU002001")).toBe(paiSku);
  });

  it("preparar enriquece após propagar", () => {
    const out = prepararDetalhesProdutoJsonCatalogo([
      {
        id: "1",
        sku: "DJU003001",
        status: "ativo",
        nome_produto: "Camisa Tecido Dunas",
        descricao: "Gola Padre | Uso casual",
        detalhes_produto_json: { caracteristicas: { composicao: "100% poliéster" } },
      },
    ]);
    const car = (out[0]?.detalhes_produto_json as { caracteristicas?: Record<string, unknown> })?.caracteristicas;
    expect(car?.composicao).toBe("100% poliéster");
    expect(car?.tecido).toBe("Dunas");
  });
});
