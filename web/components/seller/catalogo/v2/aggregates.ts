import type { SellerCatalogoItem } from "@/components/seller/SellerCatalogoGrupoUi";
import { skuProntoParaVender } from "@/lib/sellerSkuReadiness";

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

export function statusGeralGrupo(pai: SellerCatalogoItem | null, filhos: SellerCatalogoItem[]): StatusGeralGrupo {
  const linhas = linhasGrupo(pai, filhos);
  const ativos = linhas.filter(isAtivo);
  if (ativos.length === 0) return "pausado";
  if (ativos.every((it) => (it.estoque_atual ?? 0) <= 0)) return "sem_estoque";
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
