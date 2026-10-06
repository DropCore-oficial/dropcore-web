import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Criptografia de segredo (token ML, chave BYOK Anthropic) do assinante avulso
 * "Calculadora + Gestores de IA" — mesmo padrão AES-256-GCM de `sellerErpSecretBox.ts`, mas
 * com chave de ambiente PRÓPRIA (`CALCULADORA_ASSINANTE_CREDENTIALS_KEY`), nunca
 * `SELLER_ERP_CREDENTIALS_KEY` do hub — isolamento total, nem a chave de criptografia é
 * compartilhada entre os dois produtos.
 */
const VERSION_PREFIX = "v1:";

function resolveKey(): Buffer {
  const raw = process.env.CALCULADORA_ASSINANTE_CREDENTIALS_KEY?.trim() ?? "";
  if (!raw) {
    throw new Error("CALCULADORA_ASSINANTE_CREDENTIALS_KEY não configurado no servidor.");
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptCalculadoraAssinanteSecret(plain: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptCalculadoraAssinanteSecret(ciphertext: string): string {
  if (!ciphertext.startsWith(VERSION_PREFIX)) {
    throw new Error("Formato de credencial inválido.");
  }
  const payload = ciphertext.slice(VERSION_PREFIX.length);
  const [ivB64, dataB64, tagB64] = payload.split(".");
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error("Formato de credencial inválido.");
  }
  const key = resolveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("CALCULADORA_ASSINANTE_CREDENTIALS_KEY_MISMATCH");
  }
}
