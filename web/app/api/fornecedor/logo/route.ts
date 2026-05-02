/**
 * POST /api/fornecedor/logo — envia logo da empresa (fornecedor autenticado)
 * DELETE /api/fornecedor/logo — remove logo e limpa logo_url
 *
 * Usa o bucket público "produto-imagens" com caminho: {fornecedor_id}/brand/logo.{ext}
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "produto-imagens";

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

export async function POST(req: Request) {
  try {
    const fornecedor_id = await getFornecedorIdFromBearer(req);
    if (!fornecedor_id) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo de imagem obrigatório." }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo inválido. Use JPEG, PNG, WebP ou GIF." }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo deve ter no máximo 2 MB." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${fornecedor_id}/brand/logo.${ext}`;

    const { data: prev } = await supabaseAdmin.from("fornecedores").select("logo_url").eq("id", fornecedor_id).maybeSingle();
    const oldUrl = prev?.logo_url as string | null | undefined;
    if (oldUrl) {
      const oldPath = storagePathFromPublicUrl(oldUrl);
      if (oldPath && oldPath !== path) {
        await supabaseAdmin.storage.from(BUCKET).remove([oldPath]).catch(() => {});
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { upsert: true, contentType: file.type });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const logo_url = urlData.publicUrl;

    const { error: updateErr } = await supabaseAdmin.from("fornecedores").update({ logo_url }).eq("id", fornecedor_id);

    if (updateErr) {
      const colMissing =
        String(updateErr.message ?? "").toLowerCase().includes("column") || updateErr.code === "42703";
      if (colMissing) {
        return NextResponse.json(
          {
            error:
              "Coluna logo_url ausente. Execute web/scripts/add-fornecedor-logo-url.sql no Supabase.",
            code: "LOGO_COLUNA_SQL",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, logo_url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const fornecedor_id = await getFornecedorIdFromBearer(req);
    if (!fornecedor_id) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { data: row, error: selErr } = await supabaseAdmin
      .from("fornecedores")
      .select("logo_url")
      .eq("id", fornecedor_id)
      .maybeSingle();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const url = row?.logo_url as string | null | undefined;
    if (url) {
      const p = storagePathFromPublicUrl(url);
      if (p) {
        await supabaseAdmin.storage.from(BUCKET).remove([p]).catch(() => {});
      }
    }

    const { error: updateErr } = await supabaseAdmin.from("fornecedores").update({ logo_url: null }).eq("id", fornecedor_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
