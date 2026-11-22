/** Cálculo puro de estoque por grupo de SKU (pai + variações) — sem I/O, sem depender de
 * nenhum marketplace/ERP específico. Usado pelo disparo de sync de estoque pro Mercado
 * Livre depois de venda/reposição/aprovação de alteração. */
import { paiKeyDoSku } from "@/lib/skuPaiKey";

export type SkuGrupoRow = {
  id?: string;
  sku: string;
  nome_produto: string;
  cor: string;
  tamanho: string;
  status: string;
  categoria: string | null;
  estoque_atual: number | null;
  custo_total: number | null;
  imagem_url: string | null;
  link_fotos: string | null;
  descricao: string | null;
  ncm: string | null;
  origem: string | null;
  marca: string | null;
  cest: string | null;
  peso_kg: number | null;
  peso_liquido_kg: number | null;
  peso_bruto_kg: number | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
  habilitado_venda?: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

function estoqueInteiroNaoNegativo(estoque_atual: unknown): number {
  if (estoque_atual == null || estoque_atual === "") return 0;
  const n = typeof estoque_atual === "number" ? estoque_atual : parseFloat(String(estoque_atual).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Disponível para oferta no marketplace = físico - reservado. */
export function estoqueDisponivelParaVenda(estoque_atual: unknown, estoque_reservado: unknown): number {
  return Math.max(0, estoqueInteiroNaoNegativo(estoque_atual) - estoqueInteiroNaoNegativo(estoque_reservado));
}

export function filterSkusByGrupo<T extends { sku: string }>(items: T[], grupoKey: string): T[] {
  const key = str(grupoKey).toUpperCase();
  if (!key) return [];
  return items.filter((i) => paiKeyDoSku(str(i.sku)) === key);
}

/** Soma estoque das variações pro código pai do grupo. */
function somaEstoqueFilhos(filhos: SkuGrupoRow[]): number {
  return filhos.reduce((acc, f) => {
    const n = f.estoque_atual;
    if (n == null || !Number.isFinite(n)) return acc;
    return acc + Math.max(0, Math.floor(n));
  }, 0);
}

/** Filhos com estoque; se só pai, inclui pai. */
function skusAtivosDoGrupo(items: SkuGrupoRow[]): string[] {
  const filhos = items.filter((i) => !isSkuPaiInterno(str(i.sku)));
  const pool = filhos.length > 0 ? filhos : items;
  return [...new Set(pool.map((i) => str(i.sku).toUpperCase()).filter(Boolean))];
}

/** Pai (soma das variações) + filhos — grade do marketplace nem sempre agrega muitas
 * variações na listagem, então o pai precisa de um saldo próprio (soma). */
export function skusGrupoComPaiSoma(
  items: SkuGrupoRow[],
  grupoKey: string,
): { skuCodes: string[]; saldoOverrides: Map<string, number> } {
  const filhos = items.filter((i) => !isSkuPaiInterno(str(i.sku)));
  const skuCodes = skusAtivosDoGrupo(items);
  const saldoOverrides = new Map<string, number>();
  const paiKey = str(grupoKey).toUpperCase();
  if (filhos.length > 0 && paiKey) {
    saldoOverrides.set(paiKey, somaEstoqueFilhos(filhos));
    if (!skuCodes.includes(paiKey)) skuCodes.unshift(paiKey);
  }
  return { skuCodes, saldoOverrides };
}

export function grupoKeyFromSkuString(sku: string): string {
  return paiKeyDoSku(sku.trim());
}
