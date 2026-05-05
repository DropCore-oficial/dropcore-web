/**
 * Converte valor digitado em pt-BR (campo livre) para número.
 *
 * Corrige o bug de `parseFloat("77 7") === 77` (espaço no meio dos dígitos)
 * e trata milhar com ponto + decimal com vírgula.
 */
export function parseValorMonetarioPtBr(input: string | number | null | undefined): number {
  if (input == null || input === "") return NaN;
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : NaN;
  }

  let s = String(input).trim();
  s = s.replace(/[\u00a0\u2009\u202f\s]+/g, "");
  s = s.replace(/^R\$\s?/i, "").replace(/\$/g, "");

  if (!s || s === "-") return NaN;

  const hasComma = s.includes(",");
  if (hasComma) {
    const lastComma = s.lastIndexOf(",");
    const intPart = s.slice(0, lastComma).replace(/\./g, "");
    const fracPart = s.slice(lastComma + 1).replace(/[^\d]/g, "");
    const normalized = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : NaN;
  }

  const dotCount = (s.match(/\./g) || []).length;
  if (dotCount === 0) {
    const digits = s.replace(/[^\d]/g, "");
    const n = parseFloat(digits);
    return Number.isFinite(n) ? n : NaN;
  }

  if (dotCount === 1) {
    const [a, b] = s.split(".");
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && b.length === 3 && a.length > 0 && a !== "0") {
      return parseFloat(a + b);
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  const normalized = s.replace(/\./g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}
