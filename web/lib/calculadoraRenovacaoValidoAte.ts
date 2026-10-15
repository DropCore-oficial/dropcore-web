/**
 * Nova data de fim da assinatura da calculadora após PIX pago.
 * Alinha ao texto institucional: **mesmo dia do calendário** a cada ciclo (âncora em `valido_ate`),
 * não “+30 dias” a partir do pagamento quando já estava vencido.
 */

function addCalendarMonthsUTC(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * @param curIso `valido_ate` atual (ISO) antes da renovação
 * @param paymentMs instante em que o pagamento foi confirmado (normalmente `Date.now()`)
 * @param meses tamanho do ciclo pago, em meses civis (1 = mensal, 12 = anual)
 */
export function computeCalendarCycleValidoAte(curIso: string, paymentMs: number, meses: number): Date {
  const cur = new Date(String(curIso));
  if (Number.isNaN(cur.getTime())) {
    const dias = meses * 30;
    return new Date(paymentMs + dias * 24 * 60 * 60 * 1000);
  }

  // Ainda dentro do período: renovação antecipada → estende um ciclo civil a partir do fim atual
  if (paymentMs < cur.getTime()) {
    return addCalendarMonthsUTC(cur, meses);
  }

  // Vencido (ou exatamente no limite): próximo “dia de renovação” no calendário, depois do pagamento
  let end = new Date(cur.getTime());
  while (end.getTime() <= paymentMs) {
    end = addCalendarMonthsUTC(end, meses);
  }
  return end;
}

/**
 * @param curIso `valido_ate` atual (ISO) antes da renovação
 * @param paymentMs instante em que o pagamento foi confirmado (normalmente `Date.now()`)
 */
export function computeCalculadoraRenovacaoValidoAte(curIso: string, paymentMs: number): Date {
  return computeCalendarCycleValidoAte(curIso, paymentMs, 1);
}
