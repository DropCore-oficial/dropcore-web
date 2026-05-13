import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION_PREFIX = "v1:";

function resolveKey(): Buffer {
  const raw = process.env.SELLER_ERP_CREDENTIALS_KEY?.trim() ?? "";
  if (!raw) {
    throw new Error("SELLER_ERP_CREDENTIALS_KEY não configurado no servidor.");
  }
  return createHash("sha256").update(raw).digest();
}

export function maskErpSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

export function encryptSellerErpSecret(plain: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSellerErpSecret(ciphertext: string): string {
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
    throw new Error("SELLER_ERP_CREDENTIALS_KEY_MISMATCH");
  }
}

export function describeSellerErpSecretDecryptFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SELLER_ERP_CREDENTIALS_KEY não configurado")) {
    return "O servidor não tem SELLER_ERP_CREDENTIALS_KEY configurada para abrir o token salvo.";
  }
  if (message.includes("Formato de credencial inválido")) {
    return "O token salvo está em formato inválido. Salve o token API da Olist/Tiny novamente.";
  }
  if (message.includes("SELLER_ERP_CREDENTIALS_KEY_MISMATCH")) {
    return "O token foi criptografado com outra chave de servidor. Use a mesma SELLER_ERP_CREDENTIALS_KEY deste ambiente ou cole o token de novo aqui.";
  }
  return "Não foi possível abrir o token salvo neste servidor.";
}
