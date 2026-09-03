import { calcularCustoTotal } from "@/lib/taxaDropcore";

/**
 * Custo total por unidade que o seller paga — alinhado a `api/erp/pedidos`:
 * `valor_total = custo_base * qtd + custo_dropcore * qtd` (duas colunas em R$, somam).
 *
 * - Só `custo_base`: aplica `TAXA_DROPCORE_PERCENT` (comportamento do fornecedor que só preenche o custo dele).
 * - `custo_base` + `custo_dropcore` até 50% da base: soma (taxa explícita em R$).
 * - `custo_dropcore` grande face à base: trata como dado legado/inconsistente e usa só `calcularCustoTotal(cb)`
 *   (evita mostrar 25,87 quando o fornecedor cadastrou 30 e há lixo na coluna da taxa).
 * - Só `custo_dropcore`: usa esse valor (legado em que a coluna guardava o total).
 */
function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Taxa explícita em R$ não costuma ultrapassar isto × custo_base (ex.: taxa + margem); acima disso, ignora-se cd com cb. */
const MAX_TAXA_EXPLICITA_RATIO = 0.5;

export function sellerCustoTotalPagoUnitario(custo_base: unknown, custo_dropcore: unknown): number | null {
  const cb = parseNum(custo_base);
  const cd = parseNum(custo_dropcore);
  if (cb > 0) {
    if (cd > 0 && cd <= cb * MAX_TAXA_EXPLICITA_RATIO) {
      return Math.round((cb + cd) * 100) / 100;
    }
    return calcularCustoTotal(cb);
  }
  if (cd > 0) return Math.round(cd * 100) / 100;
  return null;
}
