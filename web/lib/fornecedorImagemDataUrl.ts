/** Decodifica `imagem_url` enviada como data URL base64 (cadastro/edição de produto) pra
 * subir no bucket público e persistir como URL de verdade. */
export const BUCKET_PRODUTO_IMAGENS = "produto-imagens";

const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;

export function isDataImageUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().startsWith("data:image/");
}

export function parseDataImageUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } | null {
  const m = dataUrl.trim().match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i);
  if (!m) return null;
  const contentType = m[1]!.toLowerCase().replace("jpg", "jpeg");
  try {
    const buffer = Buffer.from(m[2]!, "base64");
    if (buffer.length === 0 || buffer.length > MAX_DATA_URL_BYTES) return null;
    const ext =
      contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
    return { buffer, contentType: contentType.replace("jpg", "jpeg"), ext };
  } catch {
    return null;
  }
}
