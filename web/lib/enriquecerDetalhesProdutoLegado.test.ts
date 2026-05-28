import { describe, expect, it } from "vitest";
import { enriquecerDetalhesProdutoLegado } from "./enriquecerDetalhesProdutoLegado";

describe("enriquecerDetalhesProdutoLegado", () => {
  it("extrai guiado e tecido de colunas legadas", () => {
    const d = enriquecerDetalhesProdutoLegado(null, {
      nome_produto: "Camisa Manga Curta Gola Padre Tecido Dunas",
      descricao: "Gola Padre | Para Os Dias Quentes | Lavar A Mão",
      expedicao_override_linha:
        "RUA MANDAGUARI, S/N · QUADRA 36 · SETOR JARDIM MARISTA · CEP 75383-423 · TRINDADE/GO",
    });
    expect((d.guiado as { diferencial?: string })?.diferencial).toBe("Gola Padre");
    expect((d.caracteristicas as { tecido?: string })?.tecido).toBe("Dunas");
    expect((d.logistica as { cdSaidaCidade?: string })?.cdSaidaCidade).toBeTruthy();
  });
});
