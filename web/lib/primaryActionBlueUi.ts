/**
 * Superfícies e texto no **azul de ação primária** (`--primary-blue` / `--primary-blue-hover`).
 * HEX: `PRIMARY_ACTION_BLUE_HEX` em `dropcorePalette.ts`; vars em `app/globals.css`.
 * Regra: `.cursor/rules/dropcore-paleta-cores.mdc` — não usar `sky-*` nem `blue-*` genéricos no mesmo papel.
 */

/** Moldura transparente (chip / botão outline secundário). */
export const PRIMARY_ACTION_BLUE_SURFACE_TRANSPARENT =
  "border border-[var(--primary-blue)]/38 bg-transparent dark:border-[var(--primary-blue)]/42 dark:bg-transparent";

/** Título ou ênfase — sempre o token da marca (igual em claro/escuro). */
export const PRIMARY_ACTION_BLUE_TEXT_PRIMARY =
  "text-[var(--primary-blue)] dark:text-[var(--primary-blue)]";

/** Hover em controlo sobre fundo de cartão. */
export const PRIMARY_ACTION_BLUE_OUTLINE_HOVER =
  "hover:bg-[var(--primary-blue)]/10 dark:hover:bg-[var(--primary-blue)]/14";
