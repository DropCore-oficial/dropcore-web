/**
 * Ciclo de compromisso (mensal/semestral/anual) + desconto manual do plano principal Start/Pro.
 * Ciclo não muda o valor da parcela — só define a carência (meses grátis) antes da 1ª cobrança,
 * mesmo racional do contrato anual do pacote Gestores de IA avulso
 * (`gestoresIaAvulsoPlanos.ts`). Desconto é ortogonal ao ciclo: campo manual do admin (R$ ou %),
 * aplicado sobre o valor de tabela do plano (`financial_planos.valor_seller`).
 * Decidido e travado pelo admin na criação/edição do seller (não há escolha self-service de
 * ciclo/desconto pelo seller) — ver `/admin/sellers`.
 */
export type SellerPlanoCiclo = "mensal" | "semestral" | "anual";
export type SellerPlanoDescontoTipo = "valor" | "percentual";

/** Dias de carência (sem cobrança) antes da 1ª parcela, por ciclo escolhido. */
export const SELLER_PLANO_CICLO_CARENCIA_DIAS: Record<SellerPlanoCiclo, number> = {
  mensal: 0,
  semestral: 30,
  anual: 60,
};

/**
 * Duração do compromisso (meses cobrados após a carência) — mesma janela em que o valor
 * fica travado (`sellers.plano_ciclo_valor_travado`/`plano_ciclo_compromisso_fim`,
 * calculado na RPC `fn_seller_plano_ciclo_desconto_set`). Só documentação/referência pra UI;
 * o cálculo real roda no banco.
 */
export const SELLER_PLANO_CICLO_COMPROMISSO_MESES: Record<SellerPlanoCiclo, number> = {
  mensal: 0,
  semestral: 6,
  anual: 12,
};

export function isSellerPlanoCiclo(v: unknown): v is SellerPlanoCiclo {
  return v === "mensal" || v === "semestral" || v === "anual";
}

export function isSellerPlanoDescontoTipo(v: unknown): v is SellerPlanoDescontoTipo {
  return v === "valor" || v === "percentual";
}

/**
 * Valor real da mensalidade aplicando o desconto do seller (se houver), sobre o valor cheio
 * do plano (`financial_planos.valor_seller` do Start/Pro). `tipo=null` ou `valor` ausente/≤0 →
 * preço cheio. Arredonda pra 2 casas (centavos).
 */
export function calcularValorMensalSellerPlano(
  valorCheio: number,
  descontoTipo: SellerPlanoDescontoTipo | null,
  descontoValor: number | null
): number {
  if (!descontoTipo || descontoValor == null || !Number.isFinite(descontoValor) || descontoValor <= 0) {
    return valorCheio;
  }
  if (descontoTipo === "valor") {
    return Math.round(Math.max(0, valorCheio - descontoValor) * 100) / 100;
  }
  const pct = Math.min(100, descontoValor);
  return Math.round(valorCheio * (1 - pct / 100) * 100) / 100;
}
