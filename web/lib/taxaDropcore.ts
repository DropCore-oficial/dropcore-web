/**
 * % que o DropCore cobra em cima do custo do fornecedor (`custo_base`) quando não há
 * `custo_dropcore` explícito cadastrado — fonte única. Usada por qualquer lugar que
 * calcule o custo total pago pelo seller (criação/promoção de pedido, catálogo, vitrine,
 * e a partir de agora também exibida pro fornecedor no cadastro/edição de produto).
 */
export const TAXA_DROPCORE_PERCENT = 0.1;

export function calcularCustoDropcore(custoBase: number): number {
  return Math.round(custoBase * TAXA_DROPCORE_PERCENT * 100) / 100;
}

export function calcularCustoTotal(custoBase: number): number {
  return Math.round((custoBase + calcularCustoDropcore(custoBase)) * 100) / 100;
}
