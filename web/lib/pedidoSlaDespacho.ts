import { getValidMercadoLivreAccessToken, mlBuscarPrevisaoLiberacaoEtiqueta } from "@/lib/mercadoLivreApiClient";

/**
 * SLA de postagem por marketplace (Fase 2 — v1 só calcula/notifica, sem penalidade
 * financeira ainda). Regra de desenho já fechada: o relógio conta a partir da ETIQUETA
 * DISPONÍVEL (`etiqueta_impressa_em`), nunca da criação do pedido — atraso causado pela
 * etiqueta demorar (buffer do próprio ML, fila da Olist) não pode virar "culpa do
 * fornecedor". Mercado Livre é exceção: usa o prazo real que a própria API do ML devolve
 * (`estimated_handling_limit`), independente de etiqueta impressa.
 *
 * Regras confirmadas com o Sr Stark em 2026-09-24:
 * - Shopee: pedido [na nossa adaptação, etiqueta impressa] até 13h → despachar no mesmo
 *   dia até 23:59 (vale sábado também). Depois das 13h → dia seguinte até 23:59; se o dia
 *   seguinte cair domingo, pula pra segunda. Domingo em si nunca é dia de despacho.
 * - Shein: 24h, mas em dias úteis — sábado, domingo e feriado não contam (equivale a "1
 *   dia útil depois, mesma hora").
 * - TikTok Shop: 2 dias úteis a partir do dia da etiqueta (esse dia não conta como um dos
 *   2), até 23:59:59 do 2º dia útil seguinte. Sábado/domingo/feriado não contam.
 */

const TZ = "America/Sao_Paulo";
/** BRT é sempre UTC-3 — Brasil não tem horário de verão desde 2019. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

type BrtParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=domingo .. 6=sábado
};

const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function brtParts(d: Date): BrtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // hour12:false com Intl pode devolver "24" pra meia-noite em alguns runtimes — normaliza.
  const hourRaw = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_MAP[get("weekday")] ?? 0,
  };
}

/** Constrói o instante real (UTC) de um horário informado em BRT. */
function brtToInstant(year: number, month: number, day: number, hour: number, minute: number, second = 0): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(asIfUtc + BRT_OFFSET_MS);
}

type YMD = { year: number; month: number; day: number };

function addDiasCorridos(d: YMD, dias: number): YMD {
  const t = Date.UTC(d.year, d.month - 1, d.day) + dias * 86_400_000;
  const dt = new Date(t);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function pesoSemanaYmd(d: YMD): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

/** Domingo de Páscoa (algoritmo anônimo gregoriano — Meeus/Jones/Butcher). */
function pascoaYmd(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

const ymdKey = (d: YMD) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/**
 * Feriados nacionais do Brasil (fixos + móveis calculados a partir da Páscoa) —
 * autossuficiente, não precisa de lista atualizada ano a ano. Cobre só feriados NACIONAIS
 * (não estaduais/municipais) — limitação conhecida e aceita pra v1.
 */
function feriadosNacionaisDoAno(year: number): Set<string> {
  const fixos: YMD[] = [
    { year, month: 1, day: 1 }, // confraternização universal
    { year, month: 4, day: 21 }, // tiradentes
    { year, month: 5, day: 1 }, // dia do trabalho
    { year, month: 9, day: 7 }, // independência
    { year, month: 10, day: 12 }, // n. sra. aparecida
    { year, month: 11, day: 2 }, // finados
    { year, month: 11, day: 15 }, // proclamação da república
    { year, month: 11, day: 20 }, // consciência negra (feriado nacional)
    { year, month: 12, day: 25 }, // natal
  ];
  const pascoa = pascoaYmd(year);
  const moveis: YMD[] = [
    addDiasCorridos(pascoa, -47), // carnaval (terça)
    addDiasCorridos(pascoa, -2), // sexta-feira santa
    addDiasCorridos(pascoa, 60), // corpus christi
  ];
  return new Set([...fixos, ...moveis].map(ymdKey));
}

const feriadosCache = new Map<number, Set<string>>();
function ehFeriadoNacional(d: YMD): boolean {
  let set = feriadosCache.get(d.year);
  if (!set) {
    set = feriadosNacionaisDoAno(d.year);
    feriadosCache.set(d.year, set);
  }
  return set.has(ymdKey(d));
}

function ehDiaUtil(d: YMD): boolean {
  const peso = pesoSemanaYmd(d);
  return peso !== 0 && peso !== 6 && !ehFeriadoNacional(d);
}

/** Avança `n` dias úteis a partir de `d` (o próprio `d` nunca conta como um dos `n`). */
function addDiasUteis(d: YMD, n: number): YMD {
  let atual = d;
  let restantes = n;
  while (restantes > 0) {
    atual = addDiasCorridos(atual, 1);
    if (ehDiaUtil(atual)) restantes -= 1;
  }
  return atual;
}

export function calcularPrazoShopee(gatilho: Date): Date {
  const p = brtParts(gatilho);
  const hoje: YMD = { year: p.year, month: p.month, day: p.day };
  const antesOuNoCorte = p.hour < 13 || (p.hour === 13 && p.minute === 0 && p.second === 0);

  if (p.weekday === 0) {
    // Domingo não é dia de despacho válido — pula pra segunda, não importa o horário.
    const segunda = addDiasCorridos(hoje, 1);
    return brtToInstant(segunda.year, segunda.month, segunda.day, 23, 59, 59);
  }

  if (antesOuNoCorte) {
    return brtToInstant(hoje.year, hoje.month, hoje.day, 23, 59, 59);
  }

  let proximo = addDiasCorridos(hoje, 1);
  if (pesoSemanaYmd(proximo) === 0) proximo = addDiasCorridos(proximo, 1); // pula domingo
  return brtToInstant(proximo.year, proximo.month, proximo.day, 23, 59, 59);
}

export function calcularPrazoShein(gatilho: Date): Date {
  const p = brtParts(gatilho);
  const proximo = addDiasUteis({ year: p.year, month: p.month, day: p.day }, 1);
  return brtToInstant(proximo.year, proximo.month, proximo.day, p.hour, p.minute, p.second);
}

export function calcularPrazoTiktok(gatilho: Date): Date {
  const p = brtParts(gatilho);
  const prazo = addDiasUteis({ year: p.year, month: p.month, day: p.day }, 2);
  return brtToInstant(prazo.year, prazo.month, prazo.day, 23, 59, 59);
}

/**
 * Calcula o prazo de despacho de um pedido. `canalVenda` usa os valores canônicos de
 * `normalizeCanalVenda()` (`olistTinyApi.ts`): "shopee" | "mercado_livre" | "shein" |
 * "tiktok_shop" | "outro". Devolve `null` quando não dá pra calcular ainda (sem etiqueta
 * impressa nos 3 canais Olist, sem token/pedido no ML) ou quando o canal não tem regra
 * definida ("outro").
 */
export async function calcularPrazoDespachoPedido(params: {
  canalVenda: string | null;
  etiquetaImpressaEm: string | null;
  sellerId: string;
  marketplaceNumero: string | null;
}): Promise<Date | null> {
  if (params.canalVenda === "mercado_livre") {
    if (!params.marketplaceNumero) return null;
    const ctx = await getValidMercadoLivreAccessToken(params.sellerId);
    if (!ctx) return null;
    const iso = await mlBuscarPrevisaoLiberacaoEtiqueta(ctx, params.marketplaceNumero);
    return iso ? new Date(iso) : null;
  }

  if (!params.etiquetaImpressaEm) return null;
  const gatilho = new Date(params.etiquetaImpressaEm);
  if (Number.isNaN(gatilho.getTime())) return null;

  if (params.canalVenda === "shopee") return calcularPrazoShopee(gatilho);
  if (params.canalVenda === "shein") return calcularPrazoShein(gatilho);
  if (params.canalVenda === "tiktok_shop") return calcularPrazoTiktok(gatilho);
  return null;
}
