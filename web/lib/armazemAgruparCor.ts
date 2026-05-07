/** Agrupa linhas de produto pela cor — mesmo critério da lista do fornecedor. */

export type RowCorLike = { cor: string | null; sku: string };

export type GrupoPorCor<T extends RowCorLike = RowCorLike> = { key: string; corLabel: string; itens: T[] };

export function agruparVariantesPorCor<T extends RowCorLike>(rows: T[]): GrupoPorCor<T>[] {
  const porCor = new Map<string, GrupoPorCor<T>>();
  const ordenadas = [...rows].sort((a, b) => a.sku.localeCompare(b.sku));
  for (const row of ordenadas) {
    const cor = (row.cor ?? "").trim();
    const corLabel = cor || "Sem cor";
    const key = cor.toLowerCase() || "__sem_cor__";
    const atual = porCor.get(key);
    if (atual) {
      atual.itens.push(row);
    } else {
      porCor.set(key, { key, corLabel, itens: [row] });
    }
  }
  return Array.from(porCor.values()).sort((a, b) => {
    const skuA = a.itens[0]?.sku ?? "";
    const skuB = b.itens[0]?.sku ?? "";
    const bySku = skuA.localeCompare(skuB, "pt-BR", { numeric: true });
    if (bySku !== 0) return bySku;
    return a.corLabel.localeCompare(b.corLabel, "pt-BR");
  });
}
