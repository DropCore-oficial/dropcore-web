/**
 * **Semântica premium** — sucesso, erro e informação no mesmo modelo que `amberPremium.ts`.
 *
 * **Fonte de cor base:** variáveis `--success`, `--danger`, `--info` em `app/globals.css`.
 * Superfícies usam opacidade sobre essas variáveis para manter um único lugar para ajuste de marca.
 *
 * | Família | Uso típico |
 * |---------|------------|
 * | `*_PREMIUM_SHELL` | Chips, badges compactos (preenchimento suave + borda). |
 * | `*_PREMIUM_SURFACE` | Callouts / cartões com mais peso visual. |
 * | `*_PREMIUM_SURFACE_TRANSPARENT` | Moldura só borda + fundo transparente (claro/escuro). |
 * | `*_PREMIUM_TEXT_*` | Hierarquia de texto alinhada ao tema (títulos vs corpo suave). |
 *
 * **Âmbar / pendências:** continuar a usar `@/lib/amberPremium`.
 */

/* ─── Sucesso ─────────────────────────────────────────────────────────────── */

export const SUCCESS_PREMIUM_SHELL =
  "border border-[var(--success)]/30 bg-[var(--success)]/15 ring-1 ring-[var(--success)]/10 dark:border-[var(--success)]/40 dark:bg-[var(--success)]/12 dark:ring-[var(--success)]/15";

export const SUCCESS_PREMIUM_SURFACE =
  "border border-[var(--success)]/25 bg-[var(--success)]/10 ring-1 ring-[var(--success)]/12 dark:border-[var(--success)]/35 dark:bg-[var(--success)]/12 dark:ring-[var(--success)]/18";

/** Moldura transparente — não duplicar `border-*` light/dark nos componentes; ajustar só aqui. */
export const SUCCESS_PREMIUM_SURFACE_TRANSPARENT =
  "border border-[var(--success)]/40 bg-transparent dark:border-[var(--success)]/45 dark:bg-transparent";

export const SUCCESS_PREMIUM_TEXT_PRIMARY = "text-green-900 dark:text-green-300";
export const SUCCESS_PREMIUM_TEXT_SOFT = "text-green-800 dark:text-green-400";
export const SUCCESS_PREMIUM_TEXT_BODY = "text-green-900/90 dark:text-green-200";

/* ─── Erro / perigo ────────────────────────────────────────────────────────── */

/** Escuro: fundo de cartão opaco + borda/anel visíveis (igual ideia do âmbar) — evita “marrom” sobre #000. */
export const DANGER_PREMIUM_SHELL =
  "border border-[var(--danger)]/30 bg-[var(--danger)]/15 ring-1 ring-[var(--danger)]/10 dark:border-[var(--danger)]/50 dark:bg-neutral-900 dark:ring-[var(--danger)]/30";

export const DANGER_PREMIUM_SURFACE =
  "border border-[var(--danger)]/25 bg-[var(--danger)]/10 ring-1 ring-[var(--danger)]/12 dark:border-[var(--danger)]/40 dark:bg-neutral-900 dark:ring-[var(--danger)]/25";

/** Moldura sem preenchimento — mesmo papel que `AMBER_PREMIUM_SURFACE_TRANSPARENT` (claro + escuro). */
export const DANGER_PREMIUM_SURFACE_TRANSPARENT =
  "border border-[var(--danger)]/40 bg-transparent dark:border-red-400/40 dark:bg-transparent";

export const DANGER_PREMIUM_TEXT_PRIMARY = "text-red-900 dark:text-red-200";
export const DANGER_PREMIUM_TEXT_SOFT = "text-red-800 dark:text-red-400";
export const DANGER_PREMIUM_TEXT_BODY = "text-red-900/90 dark:text-red-200";

/* ─── Informação (neutro / cinza sistema) ─────────────────────────────────── */

export const INFO_PREMIUM_SHELL =
  "border border-[var(--info)]/30 bg-[var(--info)]/15 ring-1 ring-[var(--info)]/10 dark:border-[var(--info)]/35 dark:bg-[var(--info)]/12 dark:ring-[var(--info)]/15";

export const INFO_PREMIUM_SURFACE =
  "border border-[var(--info)]/25 bg-[var(--info)]/10 ring-1 ring-[var(--info)]/12 dark:border-[var(--info)]/30 dark:bg-[var(--info)]/12 dark:ring-[var(--info)]/18";

export const INFO_PREMIUM_SURFACE_TRANSPARENT =
  "border border-[var(--info)]/40 bg-transparent dark:border-[var(--info)]/45 dark:bg-transparent";

export const INFO_PREMIUM_TEXT_PRIMARY = "text-neutral-800 dark:text-neutral-200";
export const INFO_PREMIUM_TEXT_SOFT = "text-neutral-700 dark:text-neutral-300";
export const INFO_PREMIUM_TEXT_BODY = "text-neutral-700 dark:text-neutral-300";
