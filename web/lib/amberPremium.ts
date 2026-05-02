/**
 * **Âmbar premium** — padrão de atenção do DropCore (avisos, pendências, completude).
 * Sucesso / erro / informação: `@/lib/semanticPremium`.
 * Paleta verde + logo: `@/lib/dropcorePalette` + `dropcore_design_tokens` no Supabase.
 *
 * Dois usos:
 * 1. **Callout âmbar premium** (caixa, como “Integração incompleta” no seller): moldura
 *    `AMBER_PREMIUM_SURFACE_TRANSPARENT` + título em `AMBER_PREMIUM_TEXT_PRIMARY` + corpo neutro.
 *    Cartões preenchidos continuam com `AMBER_PREMIUM_SURFACE`.
 *    **Prefira** `AmberPremiumCallout` ou `<Alert variant="warning">` — é o padrão salvo no UI kit.
 * 2. **Chip / pílula** (badges inline, contadores): `AMBER_PREMIUM_SHELL` — não troca o callout.
 *
 * Claro: creme + borda âmbar. Escuro: superfície opaca + anel âmbar.
 */

/** Pílulas, badges inline, linhas compactas — no escuro: fundo âmbar opaco + anel (leitura clara). */
export const AMBER_PREMIUM_SHELL =
  "border border-amber-300/60 bg-amber-50 ring-1 ring-amber-600/10 dark:border-amber-400/50 dark:bg-amber-950/50 dark:ring-amber-400/40";

/** Callouts, cartões de aviso (padding maior) — dark: fundo de cartão. */
export const AMBER_PREMIUM_SURFACE =
  "border border-amber-300/60 bg-amber-50 ring-1 ring-amber-600/10 dark:border-amber-400/40 dark:bg-neutral-900 dark:ring-amber-400/35";

/**
 * Moldura sem preenchimento — **padrão oficial** para callouts transparentes (claro + escuro).
 * Alterar só aqui; não espalhar `border-*`/`dark:border-*` nos componentes.
 *
 * | Tema   | Borda              | Fundo        |
 * |--------|--------------------|--------------|
 * | Claro  | `amber-900/40` (tom do `AMBER_PREMIUM_TEXT_PRIMARY` no papel) | transparente |
 * | Escuro | `amber-400/40`     | transparente |
 */
export const AMBER_PREMIUM_SURFACE_TRANSPARENT =
  "border border-amber-900/40 bg-transparent dark:border-amber-400/40 dark:bg-transparent";

export const AMBER_PREMIUM_TEXT_PRIMARY = "text-amber-900 dark:text-amber-300";
export const AMBER_PREMIUM_TEXT_BODY = "text-amber-800 dark:text-amber-200";
export const AMBER_PREMIUM_TEXT_SOFT = "text-amber-700 dark:text-amber-300";
export const AMBER_PREMIUM_TEXT_SECONDARY = "text-stone-600 dark:text-neutral-300";
export const AMBER_PREMIUM_DOT = "text-amber-800/45 dark:text-neutral-500";
export const AMBER_PREMIUM_LINK = "text-amber-600 dark:text-amber-400";
