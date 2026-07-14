/**
 * Ciclo de repasse ao fornecedor: tudo vendido/postado de segunda a sábado
 * é pago na terça-feira da semana seguinte. Espelha `fn_ciclo_repasse` (SQL,
 * `scripts/financial-module-v2.sql` + `scripts/fix-fn-ciclo-repasse-terca.sql`).
 * Fonte única pra evitar as duplicatas que já causaram desalinhamento entre
 * telas (cada rota tinha sua própria cópia de "próxima segunda-feira").
 */

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Segunda-feira (ISO) da semana de `ref`. */
function segundaDaSemana(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const isodow = d.getDay() === 0 ? 7 : d.getDay(); // 1=segunda..7=domingo
  d.setDate(d.getDate() - (isodow - 1));
  return d;
}

/** Ciclo de repasse (terça-feira da semana seguinte à de `ref`), formato YYYY-MM-DD. */
export function proximoCicloRepasse(ref: Date = new Date()): string {
  const d = segundaDaSemana(ref);
  d.setDate(d.getDate() + 8);
  return toLocalDateStr(d);
}

const TERCA = 2; // Date.getDay(): 0=domingo..6=sábado

/** N terças-feiras futuras (a partir de hoje, sem incluir hoje), espaçadas de 7 dias. */
export function proximosCiclos(n: number, ref: Date = new Date()): string[] {
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const diaAtual = hoje.getDay();
  const diasAteProxima = ((TERCA - diaAtual + 7) % 7) || 7;
  const base = new Date(hoje);
  base.setDate(base.getDate() + diasAteProxima);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    return toLocalDateStr(d);
  });
}

/** N terças-feiras passadas (a mais recente primeiro, incluindo hoje se hoje for terça). */
export function ciclosAnteriores(n: number, ref: Date = new Date()): string[] {
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const diaAtual = hoje.getDay();
  const diasDesdeUltima = (diaAtual - TERCA + 7) % 7;
  const base = new Date(hoje);
  base.setDate(base.getDate() - diasDesdeUltima);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() - i * 7);
    return toLocalDateStr(d);
  });
}
