/** Teste grátis do painel seller/fornecedor (similar à calculadora). */

export function portalTrialDays(): number {
  const raw = typeof process !== "undefined" ? process.env.PORTAL_TRIAL_DAYS : undefined;
  const n = raw ? parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 7;
}

export function addPortalTrialIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + portalTrialDays());
  return d.toISOString();
}

export function isPortalTrialAtivo(trialValidoAte: string | null | undefined): boolean {
  if (!trialValidoAte) return false;
  const t = new Date(trialValidoAte).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

/**
 * Dias de trial gravados no convite (seller/fornecedor). `undefined`/`null` → usa {@link portalTrialDays}.
 * 0 = sem período grátis. Máximo 365.
 */
export function clampPortalTrialDiasConvite(raw: unknown): number {
  const def = portalTrialDays();
  if (raw === undefined || raw === null) return def;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(365, Math.max(0, Math.floor(n)));
}

/** Fim do trial a partir de hoje; `dias <= 0` → sem trial (`null`). */
export function portalTrialEndIsoFromConviteDias(dias: number): string | null {
  const n = Math.floor(Number(dias));
  if (!Number.isFinite(n) || n <= 0) return null;
  const capped = Math.min(365, n);
  const d = new Date();
  d.setDate(d.getDate() + capped);
  return d.toISOString();
}

/** Soma dias ao fim do trial atual (se ainda ativo) ou a partir de hoje. */
export function trialValidoAteSomarDias(trialValidoAteAtual: string | null | undefined, dias: number): string {
  const d = new Date();
  const now = Date.now();
  if (trialValidoAteAtual) {
    const cur = new Date(trialValidoAteAtual).getTime();
    if (!Number.isNaN(cur) && cur > now) {
      d.setTime(cur);
    }
  }
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}
