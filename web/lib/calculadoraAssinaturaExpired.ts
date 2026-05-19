/**
 * Compat: versões antigas de GET /api/calculadora/me devolviam 403 em vez de calc_only_locked.
 * A UI trata como entrada liberada + bloqueio na própria calculadora.
 */
export function isCalculadoraAssinaturaExpiradaLegacy403(status: number, body: unknown): boolean {
  if (status !== 403) return false;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof b.access === "string" && b.access.length > 0) return false;
  const err = typeof b.error === "string" ? b.error : "";
  return (
    /assinatura\s+(da\s+)?calculadora\s+expirada/i.test(err) ||
    /renove\s+para\s+continuar/i.test(err)
  );
}

/** Deploy antigo: 403 “sem acesso” no login — UI redireciona e bloqueia dentro do app. */
export function isCalculadoraSemAcessoLegacy403(status: number, body: unknown): boolean {
  if (status !== 403) return false;
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof b.access === "string" && b.access.length > 0) return false;
  const err = typeof b.error === "string" ? b.error : "";
  return /sem acesso à calculadora/i.test(err);
}

export type CalculadoraBloqueioMotivo =
  | "sem_assinatura"
  | "assinatura_desativada"
  | "assinatura_expirada";

export function parseCalculadoraBloqueioMotivo(body: unknown): CalculadoraBloqueioMotivo | null {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const m = b.motivo;
  if (m === "sem_assinatura" || m === "assinatura_desativada" || m === "assinatura_expirada") {
    return m;
  }
  return null;
}
