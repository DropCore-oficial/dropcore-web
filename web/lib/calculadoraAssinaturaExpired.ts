/**
 * Compat: versões antigas de GET /api/calculadora/me devolviam 403 + mensagem fixa quando a data vencia.
 * A UI nova aceita esse formato para liberar entrada e mostrar bloqueio na própria calculadora.
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
