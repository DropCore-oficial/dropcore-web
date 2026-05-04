/**
 * **Âmbar premium** — padrão de atenção do DropCore (avisos, pendências, completude).
 * Sucesso / erro / informação: `@/lib/semanticPremium`.
 * Paleta verde + logo: `@/lib/dropcorePalette` + `dropcore_design_tokens` no Supabase.
 *
 * **Referência cromática (prints fornecedor — resumo / KPI / chips):**
 * no **claro**, âmbar **queimado** (`#b45309` — “Alta prioridade”, “Pendente”, “4/36”, “—”);
 * no **escuro**, **ouro** no preto (`#F7C348`, alinhado aos prints ~`#FFD152`).
 * “Âmbar de alerta” / “cor âmbar” no produto = **esta** família (tokens abaixo), não `amber-*` Tailwind solto noutros sítios.
 *
 * Dois usos:
 * 1. **Callout âmbar premium** (caixa, como “Integração incompleta” no seller): moldura
 *    `AMBER_PREMIUM_SURFACE_TRANSPARENT` + título em `AMBER_PREMIUM_TEXT_PRIMARY` + corpo neutro.
 *    Cartões preenchidos continuam com `AMBER_PREMIUM_SURFACE`.
 *    **Prefira** `AmberPremiumCallout` ou `<Alert variant="warning">` — é o padrão salvo no UI kit.
 * 2. **Chip / pílula** (badges inline, contadores): `AMBER_PREMIUM_SHELL` — não troca o callout.
 * 3. **KPI / valor principal em aviso** (cartões compactos, contadores “pendente”): ver
 *    `amberPremiumWarningMainTextClass` — métricas e placeholders mais suaves; destaque
 *    explícito “Pendente” no tom máximo (`AMBER_PREMIUM_TEXT_PRIMARY`).
 */

/** Pílulas, badges inline, linhas compactas — no escuro: fundo âmbar opaco + anel (leitura clara). */
export const AMBER_PREMIUM_SHELL =
  "border border-[#b45309]/35 bg-[#fffbeb] ring-1 ring-[#b45309]/12 dark:border-[#F7C348]/45 dark:bg-amber-950/50 dark:ring-[#F7C348]/35";

/** Callouts, cartões de aviso (padding maior) — dark: fundo de cartão. */
export const AMBER_PREMIUM_SURFACE =
  "border border-[#b45309]/35 bg-[#fffbeb] ring-1 ring-[#b45309]/12 dark:border-[#F7C348]/42 dark:bg-neutral-900 dark:ring-[#F7C348]/32";

/**
 * Moldura sem preenchimento — **padrão oficial** para callouts transparentes (claro + escuro).
 * Alterar só aqui; não espalhar `border-*`/`dark:border-*` nos componentes.
 */
export const AMBER_PREMIUM_SURFACE_TRANSPARENT =
  "border border-[#b45309]/38 bg-transparent dark:border-[#F7C348]/42 dark:bg-transparent";

export const AMBER_PREMIUM_TEXT_PRIMARY = "text-[#b45309] dark:text-[#F7C348]";

/** Faixa vertical à esquerda (ex.: chips) — mesma leitura cromática que `AMBER_PREMIUM_TEXT_PRIMARY`. */
export const AMBER_PREMIUM_ACCENT_BAR = "border-l-[3px] border-l-[#b45309] dark:border-l-[#F7C348]";

export const AMBER_PREMIUM_TEXT_BODY = "text-[#a16207] dark:text-[#fcd34d]";

export const AMBER_PREMIUM_TEXT_SOFT = "text-[#ca8a04] dark:text-[#fbbf24]";

export const AMBER_PREMIUM_TEXT_SECONDARY = "text-stone-600 dark:text-neutral-300";

export const AMBER_PREMIUM_DOT = "text-[#ca8a04]/60 dark:text-[#F7C348]/50";

export const AMBER_PREMIUM_LINK = "text-[#ca8a04] dark:text-[#F7C348]";

/**
 * Texto principal em **cartão/KPI no tom warning** (atenção, incompleto).
 * Evita `PRIMARY` em todo número — fica pesado; contadores e “Não”/“—” usam `SOFT`.
 * Mantém **`Pendente`** (após trim) em `AMBER_PREMIUM_TEXT_PRIMARY` como ênfase semântica.
 * Subtítulo do cartão: preferir `AMBER_PREMIUM_TEXT_SECONDARY`.
 */
export function amberPremiumWarningMainTextClass(value: string): string {
  return value.trim() === "Pendente" ? AMBER_PREMIUM_TEXT_PRIMARY : AMBER_PREMIUM_TEXT_SOFT;
}
