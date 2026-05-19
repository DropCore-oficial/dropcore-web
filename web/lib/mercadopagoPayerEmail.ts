/** E-mail do pagador para Card Brick / API Payments (alinha com resolveMensalidadeCobranca no servidor). */
export function resolverEmailPagadorMp(
  sessionEmail: string | null | undefined,
  cadastroEmail?: string | null,
): string {
  const a = sessionEmail?.trim() ?? "";
  if (a) return a;
  const b = cadastroEmail?.trim() ?? "";
  if (b) return b;
  const pk = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "";
  const testFlag = process.env.NEXT_PUBLIC_MERCADOPAGO_TEST_MODE;
  if (testFlag === "true" || testFlag === "1" || pk.toUpperCase().includes("TEST")) {
    return "test@testuser.com";
  }
  return "";
}
