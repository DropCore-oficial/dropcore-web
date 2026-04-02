/**
 * GET /api/fornecedor/produtos/imagem-proxy?url=...
 * Faz proxy da imagem do Supabase Storage para evitar CORS no front.
 * Só aceita URLs do próprio Supabase do projeto.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL obrigatória." }, { status: 400 });
    }
    const decoded = decodeURIComponent(url);
    if (!SUPABASE_URL || !decoded.startsWith(SUPABASE_URL)) {
      return NextResponse.json({ error: "URL não permitida." }, { status: 403 });
    }
    const res = await fetch(decoded, { headers: { Accept: "image/*" } });
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
