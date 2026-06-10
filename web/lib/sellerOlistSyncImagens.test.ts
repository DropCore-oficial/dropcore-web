import { describe, expect, it } from "vitest";
import { listarSkusComFotosGrupo } from "@/lib/sellerOlistSyncImagens";
import type { CatalogSkuForOlistExport } from "@/lib/sellerCatalogOlistExport";

function sku(partial: Partial<CatalogSkuForOlistExport> & Pick<CatalogSkuForOlistExport, "sku">): CatalogSkuForOlistExport {
  return {
    id: partial.id ?? "1",
    nome_produto: partial.nome_produto ?? "Produto",
    cor: partial.cor ?? "",
    tamanho: partial.tamanho ?? "",
    status: partial.status ?? "ativo",
    categoria: partial.categoria ?? null,
    estoque_atual: partial.estoque_atual ?? null,
    custo_total: partial.custo_total ?? null,
    imagem_url: partial.imagem_url ?? null,
    link_fotos: partial.link_fotos ?? null,
    descricao: partial.descricao ?? null,
    ncm: partial.ncm ?? null,
    origem: partial.origem ?? null,
    marca: partial.marca ?? null,
    cest: partial.cest ?? null,
    peso_kg: partial.peso_kg ?? null,
    peso_liquido_kg: partial.peso_liquido_kg ?? null,
    peso_bruto_kg: partial.peso_bruto_kg ?? null,
    comprimento_cm: partial.comprimento_cm ?? null,
    largura_cm: partial.largura_cm ?? null,
    altura_cm: partial.altura_cm ?? null,
    habilitado_venda: partial.habilitado_venda ?? false,
    sku: partial.sku,
  };
}

describe("listarSkusComFotosGrupo", () => {
  it("inclui capa do pai e foto da variação", () => {
    const items = [
      sku({ sku: "DJU001000", link_fotos: "https://cdn.example.com/capa.jpg" }),
      sku({ sku: "DJU001001", cor: "Branco", imagem_url: "https://cdn.example.com/branco.jpg" }),
    ];
    const alvos = listarSkusComFotosGrupo(items, "DJU001000");
    expect(alvos).toEqual([
      { codigo: "DJU001000", urls: ["https://cdn.example.com/capa.jpg"] },
      { codigo: "DJU001001", urls: ["https://cdn.example.com/branco.jpg"] },
    ]);
  });

  it("usa miniatura da 1ª cor no pai quando pai sem foto", () => {
    const items = [
      sku({ sku: "DJU001000" }),
      sku({ sku: "DJU001001", cor: "Azul", imagem_url: "https://cdn.example.com/azul.jpg" }),
      sku({ sku: "DJU001002", cor: "Azul", tamanho: "G", imagem_url: "https://cdn.example.com/azul-g.jpg" }),
    ];
    const alvos = listarSkusComFotosGrupo(items, "DJU001000");
    expect(alvos[0]).toEqual({ codigo: "DJU001000", urls: ["https://cdn.example.com/azul.jpg"] });
    expect(alvos.some((a) => a.codigo === "DJU001001")).toBe(true);
  });
});
