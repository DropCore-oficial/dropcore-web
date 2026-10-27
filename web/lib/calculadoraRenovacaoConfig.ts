/** Valor e período da renovação da calculadora (PIX). Sobrescreva com CALCULADORA_RENOVACAO_VALOR no deploy. */

/** Padrão DropCore quando a env não está definida (R$ 14,99). */
const PADRAO_RENOVACAO_CALC_BRL = 14.99;

/** Plano anual (PIX único, 12 meses de uma vez) — R$149,90 = ~R$12,49/mês, "2 meses grátis"
 * frente ao mensal. Decisão 2026-10-27: desconto visível na tela, diferente do padrão do
 * pacote Gestores de IA (mesmo valor + carência escondida). */
const PADRAO_RENOVACAO_CALC_ANUAL_BRL = 149.9;

export function getCalculadoraRenovacaoValorBrl(): number | null {
  const raw = process.env.CALCULADORA_RENOVACAO_VALOR;
  if (!raw?.trim()) return PADRAO_RENOVACAO_CALC_BRL;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function getCalculadoraRenovacaoAnualValorBrl(): number | null {
  const raw = process.env.CALCULADORA_RENOVACAO_ANUAL_VALOR;
  if (!raw?.trim()) return PADRAO_RENOVACAO_CALC_ANUAL_BRL;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function getCalculadoraRenovacaoDias(): number {
  const raw = process.env.CALCULADORA_RENOVACAO_DIAS;
  const n = raw ? parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n > 0 && n <= 366 ? n : 30;
}
