/**
 * Preço do pacote avulso "Gestores de IA" (Andrey/Amanda/Ulisses/Tiago, fora do hub —
 * `calculadora_assinantes.inclui_gestores_ia`). Cobrança sempre mensal via PIX, mesmo valor
 * nos dois ciclos — a diferença do "anual" é um compromisso de 12 parcelas com os primeiros
 * `GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS` dias sem cobrança, não um valor à vista
 * diferente (decisão 2026-10-15: nada de PIX parcelado/cartão, só PIX mês a mês).
 * Sem dependência de servidor de propósito — importável também no client (preço na tela).
 */
export type GestoresIaAvulsoCiclo = "mensal" | "anual";

export const VALOR_GESTORES_IA_AVULSO_MENSAL = 797.9;
export const GESTORES_IA_AVULSO_CONTRATO_ANUAL_PARCELAS = 12;
/** Dias sem cobrança antes da 1ª parcela do contrato anual — só exibição; o valor que vale é o hardcoded na RPC. */
export const GESTORES_IA_AVULSO_CONTRATO_ANUAL_CARENCIA_DIAS = 60;

export function isGestoresIaAvulsoCiclo(v: unknown): v is GestoresIaAvulsoCiclo {
  return v === "mensal" || v === "anual";
}

/** Desconto definido pelo admin por assinante (2026-10-17) — `null` = preço cheio. */
export type GestoresIaAvulsoDescontoTipo = "valor" | "percentual";

export function isGestoresIaAvulsoDescontoTipo(v: unknown): v is GestoresIaAvulsoDescontoTipo {
  return v === "valor" || v === "percentual";
}

/**
 * Valor real da parcela mensal pra um assinante, aplicando o desconto dele (se houver).
 * `tipo=null` ou `valor` ausente/≤0 → preço cheio. Arredonda pra 2 casas (centavos).
 */
export function calcularValorMensalGestoresIaAvulso(
  descontoTipo: GestoresIaAvulsoDescontoTipo | null,
  descontoValor: number | null
): number {
  const cheio = VALOR_GESTORES_IA_AVULSO_MENSAL;
  if (!descontoTipo || descontoValor == null || !Number.isFinite(descontoValor) || descontoValor <= 0) {
    return cheio;
  }
  if (descontoTipo === "valor") {
    return Math.round(Math.max(0, cheio - descontoValor) * 100) / 100;
  }
  const pct = Math.min(100, descontoValor);
  return Math.round(cheio * (1 - pct / 100) * 100) / 100;
}
