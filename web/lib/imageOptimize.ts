/**
 * Redimensiona/comprime imagem de catálogo no upload, uma vez só — substitui o Image
 * Transformation sob demanda do Supabase Storage (cobrado por imagem de origem distinta
 * no ciclo, estourava a cota do plano Pro com o tráfego da vitrine).
 */
import sharp from "sharp";

const MAX_WIDTH = 1600;
const QUALITY = 82;

export async function optimizeImageBuffer(buffer: Buffer, contentType: string): Promise<Buffer> {
  if (contentType === "image/gif") return buffer;

  try {
    const resized = sharp(buffer, { failOn: "none" }).rotate().resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
    });

    if (contentType === "image/png") {
      return await resized.png({ compressionLevel: 9, quality: QUALITY }).toBuffer();
    }
    if (contentType === "image/webp") {
      return await resized.webp({ quality: QUALITY }).toBuffer();
    }
    return await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
  } catch (e: unknown) {
    console.warn("[imageOptimize] falha ao otimizar, usando original:", e instanceof Error ? e.message : e);
    return buffer;
  }
}
