import type { ProdutoResumoLista } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { resolverDetalhesProdutoJson } from "@/lib/detalhesProdutoJson";
import { linkFotosFromDetalhesJson, resolverLinkFotosProduto } from "@/lib/fornecedorCriarVariantesRascunho";
import type { GrupoCatalogoV2 } from "./aggregates";
import { linhasGrupo } from "./aggregates";
import { parseLinkFotosLista } from "./parseLinkFotosLista";

export function sellerItemToProdutoResumoLista(it: SellerCatalogoItem): ProdutoResumoLista {
  return {
    sku: it.sku,
    nome_produto: it.nome_produto,
    cor: it.cor?.trim() ? it.cor : null,
    tamanho: it.tamanho?.trim() ? it.tamanho : null,
    descricao: it.descricao ?? null,
    categoria: it.categoria ?? null,
    data_lancamento: it.data_lancamento ?? null,
    link_fotos: it.link_fotos ?? null,
    imagem_url: it.imagem_url ?? null,
    comprimento_cm: it.comprimento_cm ?? null,
    largura_cm: it.largura_cm ?? null,
    altura_cm: it.altura_cm ?? null,
    peso_kg: it.peso_kg ?? null,
    dimensoes_pacote: it.dimensoes_pacote ?? null,
    custo_base: it.custo_total ?? null,
    ncm: it.ncm ?? null,
    origem: it.origem ?? null,
    cest: it.cest ?? null,
    cfop: it.cfop ?? null,
    peso_liquido_kg: null,
    peso_bruto_kg: null,
    marca: it.marca ?? null,
    expedicao_override_linha: it.expedicao_override_linha ?? null,
    detalhes_produto_json: it.detalhes_produto_json ?? null,
  };
}

function primeiroLinkAlbum(items: SellerCatalogoItem[]): string | null {
  for (const it of items) {
    const chunks = parseLinkFotosLista(it.link_fotos);
    for (const chunk of chunks) {
      const u = chunk.trim();
      if (u && /^https?:\/\//i.test(u)) return u;
    }
    const doJson = linkFotosFromDetalhesJson(it.detalhes_produto_json);
    if (doJson && /^https?:\/\//i.test(doJson)) return doJson;
    const img = String(it.imagem_url ?? "").trim();
    if (img && /^https?:\/\//i.test(img)) return img;
  }
  return null;
}

export function sellerGrupoToProdutoResumoListaGrupoProps(
  grupo: GrupoCatalogoV2,
  fornecedorLigadoId?: string | null
) {
  const pai = grupo.pai ? sellerItemToProdutoResumoLista(grupo.pai) : null;
  const filhosVariantes = grupo.filhos.map(sellerItemToProdutoResumoLista);
  const repSource = grupo.pai ?? grupo.filhos[0];
  if (!repSource) {
    throw new Error("sellerGrupoToProdutoResumoListaGrupoProps: grupo sem SKU representativo.");
  }
  const representante = sellerItemToProdutoResumoLista(repSource);
  const linhas = linhasGrupo(grupo.pai, grupo.filhos);
  const repDetalhes = resolverDetalhesProdutoJson(
    grupo.pai?.detalhes_produto_json,
    ...grupo.filhos.map((f) => f.detalhes_produto_json)
  );
  const linkAlbum =
    primeiroLinkAlbum(linhas) ||
    (repDetalhes ? linkFotosFromDetalhesJson(repDetalhes) : null) ||
    resolverLinkFotosProduto(repSource.link_fotos) ||
    null;
  return {
    grupoKey: grupo.paiKey,
    pai: pai ? { ...pai, detalhes_produto_json: repDetalhes ?? pai.detalhes_produto_json } : null,
    filhosVariantes,
    representante: repDetalhes ? { ...representante, detalhes_produto_json: repDetalhes } : representante,
    linkAlbum,
    editHref: "/seller/produtos",
    fornecedorId: fornecedorLigadoId,
  };
}
