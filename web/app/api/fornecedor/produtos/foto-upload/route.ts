/**
 * POST /api/fornecedor/produtos/foto-upload — sobe 1 foto por vez pro storage e devolve a URL
 * pública, na hora (sem esperar o fornecedor terminar de preencher o produto inteiro).
 *
 * Existe por causa do limite de corpo de requisição do Vercel (~4.5MB): juntar várias fotos em
 * base64 num `POST`/`PATCH` só (como o cadastro fazia pra 1 foto de capa por cor) não escala
 * pra "3 a 7 fotos por cor" — um produto com poucas cores já passaria do limite. Cada chamada
 * aqui carrega só 1 arquivo, então o limite de corpo deixa de ser problema.
 */
import { NextResponse } from "next/server";
import { resolverFornecedorContexto } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseDataImageUrl, BUCKET_PRODUTO_IMAGENS } from "@/lib/fornecedorImagemDataUrl";
import { optimizeImageBuffer } from "@/lib/imageOptimize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bem abaixo do limite de corpo do Vercel (~4.5MB) mesmo depois da inflação de ~37% do base64. */
const MAX_DATA_URL_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await resolverFornecedorContexto(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { imagemBase64?: string; cor?: string };
  const imagemBase64 = typeof body.imagemBase64 === "string" ? body.imagemBase64.trim() : "";
  if (!imagemBase64.startsWith("data:image/")) {
    return NextResponse.json({ error: "Envie uma imagem em base64 (data:image/...)." }, { status: 400 });
  }
  if (imagemBase64.length > MAX_DATA_URL_BYTES * 1.4) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. ~3 MB). Comprima a imagem." }, { status: 400 });
  }

  const parsed = parseDataImageUrl(imagemBase64);
  if (!parsed) {
    return NextResponse.json({ error: "Não consegui ler essa imagem — use JPEG, PNG, WebP ou GIF." }, { status: 400 });
  }
  if (parsed.buffer.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. ~3 MB). Comprima a imagem." }, { status: 400 });
  }

  const corSanitizada = (body.cor ?? "").trim().replace(/[^a-z0-9]/gi, "") || "foto";
  const path = `${ctx.fornecedor_id}/foto-upload/${Date.now()}-${corSanitizada}-${Math.round(Math.random() * 1e6)}.${parsed.ext}`;
  const otimizado = await optimizeImageBuffer(parsed.buffer, parsed.contentType);
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET_PRODUTO_IMAGENS)
    .upload(path, otimizado, { upsert: true, contentType: parsed.contentType });
  if (uploadErr) {
    return NextResponse.json({ error: `Falha ao subir a imagem: ${uploadErr.message}` }, { status: 502 });
  }

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET_PRODUTO_IMAGENS).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
