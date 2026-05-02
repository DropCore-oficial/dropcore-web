/**
 * **Paleta DropCore** — espelha `public.dropcore_design_tokens` (script `web/scripts/create-dropcore-design-tokens.sql`).
 * Regra Cursor: `.cursor/rules/dropcore-paleta-cores.mdc` — não acrescentar outros verdes/HEX sem atualizar este ficheiro, a BD e a regra.
 *
 * - **Logo:** `#22C55E` — exclusivo de `DropCoreLogo`, não reutilizar noutros sítios.
 * - **Verde UI:** apenas os steps abaixo; opacidades permitidas listadas em `ALLOWED_EMERALD_OPACITIES` e na regra `.cursor/rules/dropcore-paleta-cores.mdc`.
 * - **Alertas:** `amberPremium.ts` (âmbar), não usar emerald para warnings.
 * - **Azul CTA primário:** `PRIMARY_ACTION_BLUE_HEX` / vars `--primary-blue` em `globals.css` (links de sistema e botões que não usam emerald).
 */

export const LOGO_GREEN_HEX = "#22C55E" as const;

/** Azul de ação primária (CTAs, focos de input alinhados à marca) — espelha `tokens.ui_blue.primaria_acao` no Supabase */
export const PRIMARY_ACTION_BLUE_HEX = "#0078D4" as const;
export const PRIMARY_ACTION_BLUE_HOVER_HEX = "#106ebe" as const;

/** Escala UI (Tailwind emerald) — valores alinhados à tabela `tokens.ui_green.escala` no Supabase */
export const EMERALD_SCALE = {
  50: "#ecfdf5",
  100: "#d1fae5",
  300: "#6ee7b7",
  400: "#34d399",
  500: "#10b981",
  600: "#059669",
  700: "#047857",
  900: "#064e3b",
  950: "#022c22",
} as const;

export type EmeraldStep = keyof typeof EMERALD_SCALE;

/** Sufixos `/…` permitidos em `emerald-*` — lista fechada (múltiplos de 5 de 5 a 95). */
export const ALLOWED_EMERALD_OPACITIES = [
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
  "65",
  "70",
  "75",
  "80",
  "85",
  "90",
  "95",
] as const;
