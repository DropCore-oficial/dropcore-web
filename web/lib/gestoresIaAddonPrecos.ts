/**
 * Preço do add-on "Gestores de IA" (Diogo/Andrey/Amanda + futuros — Ulisses já é grátis no
 * Pro). Depende do plano base do seller — os dois caminhos chegam no mesmo total
 * (R$797,90), o Pro só paga menos porque o Ulisses já vem incluso. Ver docs/SCHEMA.md.
 * Sem dependência de servidor (supabaseAdmin) de propósito — importável também no client.
 */
export const VALOR_ADDON_GESTORES_IA_START = 700;
export const VALOR_ADDON_GESTORES_IA_PRO = 600;

export function valorAddonGestoresIaPorPlano(plano: string | null | undefined): number {
  return String(plano ?? "").trim().toLowerCase() === "pro"
    ? VALOR_ADDON_GESTORES_IA_PRO
    : VALOR_ADDON_GESTORES_IA_START;
}
