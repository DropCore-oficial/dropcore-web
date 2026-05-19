/**
 * Âncora de vencimento da mensalidade (dia 1–28 no mês civil), alinhada à ideia da calculadora.
 * Meses com menos dias: usa-se o mínimo entre o dia escolhido e o último dia do mês.
 */

export function clampMensalidadeDiaVencimento(day: number): number {
  if (!Number.isFinite(day)) return 10;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

/** Dia do mês em America/Sao_Paulo (para coincidir com o “calendário” do negócio no Brasil). */
export function mensalidadeDiaVencimentoHojeSaoPaulo(d = new Date()): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
  }).formatToParts(d);
  const dayPart = partes.find((p) => p.type === "day");
  const n = dayPart ? parseInt(dayPart.value, 10) : NaN;
  return clampMensalidadeDiaVencimento(n);
}

/** Extrai o dia de `YYYY-MM-DD` (ex.: data_entrada). */
export function mensalidadeDiaVencimentoFromDataEntrada(yyyyMmDd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim());
  if (!m) return 10;
  return clampMensalidadeDiaVencimento(parseInt(m[3], 10));
}

/**
 * `ciclo` gravado na mensalidade = primeiro dia do mês (`YYYY-MM-01`).
 * Retorna `YYYY-MM-DD` do vencimento naquele mês civil.
 */
export function vencimentoEmNoCiclo(primeiroDiaMesYmd: string, diaVencimento: number): string {
  const dia = clampMensalidadeDiaVencimento(diaVencimento);
  const base = String(primeiroDiaMesYmd).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base);
  if (!m) return base;
  const y = parseInt(m[1], 10);
  const monthIndex = parseInt(m[2], 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return base;
  const last = new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  const use = Math.min(dia, last);
  return `${m[1]}-${m[2]}-${String(use).padStart(2, "0")}`;
}

/** Ciclo atual `YYYY-MM` em America/Sao_Paulo. */
export function cicloMesAtualSaoPaulo(d = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = partes.find((p) => p.type === "year")?.value;
  const mo = partes.find((p) => p.type === "month")?.value;
  if (!y || !mo) {
    const iso = d.toISOString().slice(0, 7);
    return /^\d{4}-\d{2}$/.test(iso) ? iso : "1970-01";
  }
  return `${y}-${mo}`;
}
