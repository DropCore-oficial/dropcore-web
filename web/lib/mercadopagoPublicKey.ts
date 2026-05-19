/** Chave pública MP (pareada com MERCADOPAGO_ACCESS_TOKEN — teste ou produção). */
export function getMercadoPagoPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.trim();
  return key || null;
}
