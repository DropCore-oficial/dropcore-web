import { describe, expect, it } from "vitest";
import { capaImagemUrlProduto } from "./fornecedorCapaProduto";

describe("capaImagemUrlProduto", () => {
  it("usa 1ª cor na ordem do formulário", () => {
    expect(
      capaImagemUrlProduto({
        fotoUrlPorCor: { preto: "https://x/preto.jpg", branco: "https://x/branco.jpg" },
        ordemCores: ["Branco", "Preto"],
      }),
    ).toBe("https://x/branco.jpg");
  });

  it("prefere link_fotos quando é URL de imagem direta", () => {
    expect(
      capaImagemUrlProduto({
        fotoUrlPorCor: { azul: "https://x/azul.jpg" },
        linkFotos: "https://cdn.example.com/capa.jpg",
      }),
    ).toBe("https://cdn.example.com/capa.jpg");
  });
});
