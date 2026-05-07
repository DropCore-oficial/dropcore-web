import type { ProdutoResumoLista } from "@/components/fornecedor/ProdutoResumoListaGrupo";
import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
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
    marca: null,
    data_lancamento: null,
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
    expedicao_override_linha: null,
    detalhes_produto_json: null,
  };
}

function primeiroLinkAlbum(items: SellerCatalogoItem[]): string | null {
  for (const it of items) {
    const chunks = parseLinkFotosLista(it.link_fotos);
    for (const chunk of chunks) {
      const u = chunk.trim();
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
}

export function sellerGrupoToProdutoResumoListaGrupoProps(grupo: GrupoCatalogoV2) {
  const pai = grupo.pai ? sellerItemToProdutoResumoLista(grupo.pai) : null;
  const filhosVariantes = grupo.filhos.map(sellerItemToProdutoResumoLista);
  const repSource = grupo.pai ?? grupo.filhos[0];
  if (!repSource) {
    throw new Error("sellerGrupoToProdutoResumoListaGrupoProps: grupo sem SKU representativo.");
  }
  const representante = sellerItemToProdutoResumoLista(repSource);
  const linkAlbum = primeiroLinkAlbum(linhasGrupo(grupo.pai, grupo.filhos));
  return {
    grupoKey: grupo.paiKey,
    pai,
    filhosVariantes,
    representante,
    linkAlbum,
    editHref: "/seller/produtos",
  };
}
