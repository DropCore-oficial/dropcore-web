/**
 * UI travada do alerta **Saldo crítico para novos pedidos** (seller dashboard).
 * Espelha `tokens.ui_danger.seller_dashboard_saldo_critico` em `create-dropcore-design-tokens.sql`.
 *
 * **Somente** `var(--danger)` (`#EF4444`) + escala Tailwind **`red-*`** nos steps listados em `DANGER_UI_RED_STEPS`
 * em `dropcorePalette.ts`. **Sem** `rose-*`, sem HEX vermelhos extra.
 */

/** Moldura do cartão: claro e escuro (fundo sempre transparente). */
export const SELLER_SALDO_CRITICO_CARD_SURFACE =
  "relative overflow-hidden border border-[var(--danger)]/55 bg-transparent shadow-sm shadow-red-500/10 dark:border-red-400/55 dark:bg-transparent dark:shadow-none";

/** Barra vertical à esquerda (mesmo papel que o accent verde do “Saldo total”). */
export const SELLER_SALDO_CRITICO_ACCENT_BAR =
  "pointer-events-none absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[var(--danger)] to-red-600 opacity-95 dark:from-red-400 dark:to-red-500 dark:opacity-100";

/** Padding do conteúdo em relação à barra. */
export const SELLER_SALDO_CRITICO_INNER_PAD = "pl-4 sm:pl-5";

/** Moldura do ícone de alerta. */
export const SELLER_SALDO_CRITICO_ICON_WRAP =
  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 dark:border-red-400/55 dark:bg-transparent";

/** Cor do traço do ícone SVG. */
export const SELLER_SALDO_CRITICO_ICON_STROKE =
  "h-5 w-5 text-[var(--danger)] dark:text-red-300";

/** Título do alerta. */
export const SELLER_SALDO_CRITICO_TITLE =
  "text-base font-bold leading-snug tracking-tight text-[var(--danger)] dark:text-red-300";

/** Parágrafo explicativo (trecho crítico: disponível / texto longo). */
export const SELLER_SALDO_CRITICO_BODY =
  "mt-2.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300";

/** CTA primário do alerta. */
export const SELLER_SALDO_CRITICO_BUTTON =
  "mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors bg-[var(--danger)] hover:opacity-90 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:shadow-sm dark:shadow-red-950/50 dark:ring-1 dark:ring-inset dark:ring-white/20";
