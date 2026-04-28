/**
 * GET /api/fornecedor/produtos/imagem-proxy?url=...
 * Faz proxy da imagem do Supabase Storage para evitar CORS no front.
 * Só aceita URLs do próprio Supabase do projeto.
 */
import { NextResponse } from "next/server";
import { isSameProjectSupabaseStorageUrl } from "@/lib/supabaseStorageImageUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Usa Image Transformation do Supabase Storage quando possível (melhor para retina / zoom). */
function supabaseObjectUrlToRenderUrl(original: string, width: number): string | null {
  const base = original.split("?")[0];
  if (!base.includes("/storage/v1/object/public/")) return null;
  const renderBase = base.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const w = Math.min(2048, Math.max(320, Math.round(width)));
  const q = new URLSearchParams({ width: String(w), quality: "88", resize: "contain" });
  return `${renderBase}?${q.toString()}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL obrigatória." }, { status: 400 });
    }
    const decoded = decodeURIComponent(url);
    if (!SUPABASE_URL || !isSameProjectSupabaseStorageUrl(decoded)) {
      return NextResponse.json({ error: "URL não permitida." }, { status: 403 });
    }
    const wParam = searchParams.get("w");
    const width = wParam ? Number(wParam) : 960;
    const renderUrl = supabaseObjectUrlToRenderUrl(decoded, Number.isFinite(width) ? width : 960);
    const fetchUrl = renderUrl ?? decoded;
    let res = await fetch(fetchUrl, { headers: { Accept: "image/*" } });
    if (!res.ok && renderUrl) {
      res = await fetch(decoded, { headers: { Accept: "image/*" } });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
