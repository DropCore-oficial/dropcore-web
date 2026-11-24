/**
 * POST /api/fornecedor/produtos/[id]/imagem — upload de foto por variação (SKU)
 * DELETE /api/fornecedor/produtos/[id]/imagem — remove foto da variação
 *
 * Requer bucket público "produto-imagens" no Supabase Storage.
 * Crie em: Storage > New bucket > nome: produto-imagens, Public: sim
 */
import { NextResponse } from "next/server";
import { resolverFornecedorContexto } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { optimizeImageBuffer } from "@/lib/imageOptimize";

export const runtime = "nodejs";

const BUCKET = "produto-imagens";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolverFornecedorContexto(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: skuId } = await params;
    if (!skuId) return NextResponse.json({ error: "ID do produto é obrigatório." }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo de imagem obrigatório." }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo inválido. Use JPEG, PNG, WebP ou GIF." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Imagem deve ter no máximo 5 MB." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${ctx.fornecedor_id}/${skuId}/foto.${ext}`;

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const buffer = await optimizeImageBuffer(rawBuffer, file.type);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { upsert: true, contentType: file.type });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const imagemUrl = urlData.publicUrl;

    const { data: sku, error: updateErr } = await supabaseAdmin
      .from("skus")
      .update({ imagem_url: imagemUrl })
      .eq("id", skuId)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .select("id, sku, imagem_url")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    if (!sku) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });

    return NextResponse.json({ imagem_url: imagemUrl, sku });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolverFornecedorContexto(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { id: skuId } = await params;
    if (!skuId) return NextResponse.json({ error: "ID do produto é obrigatório." }, { status: 400 });

    const { data: sku } = await supabaseAdmin
      .from("skus")
      .select("id, sku, imagem_url")
      .eq("id", skuId)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .single();

    if (!sku) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });

    const { error: updateErr } = await supabaseAdmin
      .from("skus")
      .update({ imagem_url: null })
      .eq("id", skuId)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (sku.imagem_url) {
      const url = new URL(sku.imagem_url);
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (pathMatch) {
        await supabaseAdmin.storage.from(BUCKET).remove([pathMatch[1]]);
      }
    }

    return NextResponse.json({ imagem_url: null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
