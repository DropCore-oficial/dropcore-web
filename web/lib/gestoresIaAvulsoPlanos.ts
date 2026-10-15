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
