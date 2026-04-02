import { createHmac, timingSafeEqual } from "crypto";

/**
 * Valida o header X-Bling-Signature-256 (HMAC-SHA256 do body UTF-8 com o client secret do app).
 */
export function verifyBlingSignature256(
  rawBody: string,
  header: string | null,
  clientSecret: string
): boolean {
  if (!header?.trim() || !clientSecret?.trim()) return false;
  const expected = "sha256=";
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith(expected)) return false;
  const receivedHex = trimmed.slice(expected.length).trim();
  const hmacHex = createHmac("sha256", clientSecret).update(rawBody, "utf8").digest("hex");
  if (receivedHex.length !== hmacHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(receivedHex, "hex"), Buffer.from(hmacHex, "hex"));
  } catch {
    return false;
  }
}
