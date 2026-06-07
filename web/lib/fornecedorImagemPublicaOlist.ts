/**
 * Converte `imagem_url` base64 do cadastro fornecedor em URL pública (Supabase)
 * para exportação Olist — a planilha não aceita data URL (limite ~2 MB).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { urlImagemExportOlist } from "@/lib/sellerCatalogOlistExport";

const BUCKET = "produto-imagens";
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;

export function isDataImageUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().startsWith("data:image/");
}

function parseDataImageUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } | null {
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

/** Se já for URL http(s) exportável, devolve como está; se base64, sobe ao bucket e persiste no SKU. */
export async function ensurePublicImagemUrlForOlist(opts: {
  supabase: SupabaseClient;
  orgId: string;
  fornecedorId: string;
  skuDbId: string;
  imagemUrl: string | null | undefined;
}): Promise<string | null> {
  const raw = typeof opts.imagemUrl === "string" ? opts.imagemUrl.trim() : "";
  if (!raw) return null;

  const exportavel = urlImagemExportOlist(raw);
  if (exportavel) return exportavel;

  if (!isDataImageUrl(raw)) return null;

  const parsed = parseDataImageUrl(raw);
  if (!parsed) return null;

  const path = `${opts.fornecedorId}/${opts.skuDbId}/foto-olist.${parsed.ext}`;
  const { error: uploadErr } = await opts.supabase.storage
    .from(BUCKET)
    .upload(path, parsed.buffer, { upsert: true, contentType: parsed.contentType });

  if (uploadErr) {
    console.warn("[ensurePublicImagemUrlForOlist] upload:", uploadErr.message);
    return null;
  }

  const { data: urlData } = opts.supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: updateErr } = await opts.supabase
    .from("skus")
    .update({ imagem_url: publicUrl })
    .eq("id", opts.skuDbId)
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (updateErr) {
    console.warn("[ensurePublicImagemUrlForOlist] update skus:", updateErr.message);
  }

  return urlImagemExportOlist(publicUrl);
}

export async function normalizeImagensForOlistExport<T extends { id: string; imagem_url: string | null }>(
  items: T[],
  ctx: { supabase: SupabaseClient; orgId: string; fornecedorId: string },
): Promise<T[]> {
  const out: T[] = [];
  for (const item of items) {
    const resolved = await ensurePublicImagemUrlForOlist({
      supabase: ctx.supabase,
      orgId: ctx.orgId,
      fornecedorId: ctx.fornecedorId,
      skuDbId: item.id,
      imagemUrl: item.imagem_url,
    });
    out.push(resolved != null && resolved !== item.imagem_url ? { ...item, imagem_url: resolved } : item);
  }
  return out;
}
