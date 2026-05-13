"use client";

import { Alert, type AlertProps } from "./Alert";

/**
 * **Callout âmbar premium** — usado em avisos de atenção no app (ex.: seller):
 * borda `AMBER_PREMIUM_SURFACE_TRANSPARENT` (só moldura; fundo transparente), título âmbar, corpo neutro.
 */
export type AmberPremiumCalloutProps = Omit<AlertProps, "variant">;

export function AmberPremiumCallout(props: AmberPremiumCalloutProps) {
  return <Alert variant="warning" {...props} />;
}
