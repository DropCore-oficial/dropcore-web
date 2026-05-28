import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { agruparVariantesPorCor } from "@/lib/armazemAgruparCor";
import { corGrupoTemEstoqueParaHabilitar, skuProntoParaVender } from "@/lib/sellerSkuReadiness";

export type GrupoCatalogoV2 = {
  paiKey: string;
  pai: SellerCatalogoItem | null;
  filhos: SellerCatalogoItem[];
};

/** Linha exibida no painel de variações (mapeada a partir de `SellerCatalogoItem`). */
export type LinhaCatalogoV2 = {
  item: SellerCatalogoItem;
  sku: string;
  imagemUrl: string | null;
  cor: string;
  tamanho: string;
  estoque: number;
  custo: number;
  ativo: boolean;
  prontoParaVender: boolean;
  habilitado: boolean;
  /** True se a cor (todas numerações do grupo) tem ao menos um tamanho com estoque. */
  corTemEstoqueParaHabilitar: boolean;
};

export type StatusGeralGrupo = "pronto" | "pendencias" | "sem_estoque" | "pausado";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function isAtivo(item: SellerCatalogoItem): boolean {
  return str(item.status).toLowerCase() === "ativo";
}

/** Linhas do grupo (pai + filhos), na ordem exibida. */
export function linhasGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): SellerCatalogoItem[] {
  const out: SellerCatalogoItem[] = [];
  if (pai) out.push(pai);
  out.push(...filhos);
  return out;
}

function toLinhaCatalogoBase(it: SellerCatalogoItem): Omit<LinhaCatalogoV2, "corTemEstoqueParaHabilitar"> {
  const ativo = isAtivo(it);
  const est = it.estoque_atual;
  const custo = it.custo_total;
  return {
    item: it,
    sku: it.sku,
    imagemUrl: it.imagem_url,
    cor: it.cor ?? "",
    tamanho: it.tamanho ?? "",
    estoque: typeof est === "number" && Number.isFinite(est) ? est : 0,
    custo: typeof custo === "number" && Number.isFinite(custo) ? custo : 0,
    ativo,
    prontoParaVender: skuProntoParaVender(it),
    habilitado: it.habilitado_venda === true,
  };
}

/** Mapeia itens do catálogo e calcula se a cor pode ser ligada na API (estoque em algum tamanho). */
export function mapLinhasCatalogoV2(items: SellerCatalogoItem[]): LinhaCatalogoV2[] {
  const gruposCor = agruparVariantesPorCor(items);
  const corComEstoque = new Map<string, boolean>();
  for (const g of gruposCor) {
    const ativos = g.itens.filter((it) => isAtivo(it as SellerCatalogoItem));
    corComEstoque.set(g.key, corGrupoTemEstoqueParaHabilitar(ativos));
  }
  return items.map((it) => {
    const corKey = (it.cor ?? "").trim().toLowerCase() || "__sem_cor__";
    return {
      ...toLinhaCatalogoBase(it),
      corTemEstoqueParaHabilitar: corComEstoque.get(corKey) ?? false,
    };
  });
}

export function statusGeralGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): StatusGeralGrupo {
  const linhas = linhasGrupo(pai, filhos);
  const ativos = linhas.filter(isAtivo);
  if (ativos.length === 0) return "pausado";
  const porCor = agruparVariantesPorCor(ativos);
  if (porCor.every((g) => !corGrupoTemEstoqueParaHabilitar(g.itens))) return "sem_estoque";
  if (ativos.some((it) => !skuProntoParaVender(it))) return "pendencias";
  return "pronto";
}

export function menorCustoGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): number | null {
  let min: number | null = null;
  for (const it of linhasGrupo(pai, filhos)) {
    if (!isAtivo(it)) continue;
    const c = it.custo_total;
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
    min = min == null ? c : Math.min(min, c);
  }
  return min;
}

export function estoqueTotalGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): number {
  let s = 0;
  for (const it of linhasGrupo(pai, filhos)) {
    if (!isAtivo(it)) continue;
    const e = it.estoque_atual;
    if (typeof e === "number" && Number.isFinite(e) && e > 0) s += e;
  }
  return s;
}

export function contagemHabilitadosGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): number {
  return linhasGrupo(pai, filhos).filter((it) => it.habilitado_venda === true).length;
}
