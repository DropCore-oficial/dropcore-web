/**
 * `peso_kg` na base está em quilogramas.
 * ≥ 1 kg → kg; &lt; 1 kg → **gramas** (com decimais se preciso).
 * **mg** só quando o peso em gramas é &lt; 0,01 g (ex.: pó / amostra minúscula) — evita "250 mg" para 0,25 g.
 */
export function formatPesoCatalogo(pesoKg: number | null | undefined): string {
  if (pesoKg == null || !Number.isFinite(pesoKg)) return "";
  if (pesoKg === 0) return "0 g";

  const sinal = pesoKg < 0 ? "-" : "";
  const kg = Math.abs(pesoKg);

  if (kg >= 1) {
    const txt = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: kg >= 10 ? 1 : 2,
      minimumFractionDigits: 0,
    }).format(kg);
    return `${sinal}${txt} kg`;
  }

  const g = kg * 1000;

  if (g >= 1) {
    const arred = g >= 100 ? Math.round(g) : Number(g.toFixed(g >= 10 ? 1 : 2));
    const txt = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(arred);
    return `${sinal}${txt} g`;
  }

  if (g >= 0.01) {
    const txt = new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 3,
      minimumFractionDigits: 0,
    }).format(g);
    return `${sinal}${txt} g`;
  }

  const mg = g * 1000;
  const mgR = Math.round(mg);
  const txt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(mgR);
  return `${sinal}${txt} mg`;
}
