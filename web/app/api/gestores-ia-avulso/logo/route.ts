/**
 * POST /api/gestores-ia-avulso/logo — envia logo do assinante avulso (Calculadora/Gestores
 * de IA, sem seller/org completo). DELETE remove.
 *
 * Bucket público "produto-imagens" (mesmo do `/api/seller/logo`): path
 * `calculadora-assinante/{assinante_id}/brand/logo.{ext}` — namespace próprio pra nunca
 * colidir com `{seller_id}/brand/logo.{ext}`.
 *
 * Leitura/escrita da coluna `calculadora_assinantes.logo_url` via RPC
 * (`fn_calculadora_assinante_logo_get`/`_set`, ver web/scripts/add-calculadora-assinante-logo.sql)
 * — regra 9 do CLAUDE.md, endpoint novo nunca usa `.from()` direto.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";

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
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
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
    const path = `calculadora-assinante/${assinante.id}/brand/logo.${ext}`;

    const { data: oldUrl } = await supabaseAdmin.rpc("fn_calculadora_assinante_logo_get", {
      p_assinante_id: assinante.id,
    });
    if (oldUrl) {
      const oldPath = storagePathFromPublicUrl(String(oldUrl));
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

    const { error: setErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_logo_set", {
      p_assinante_id: assinante.id,
      p_logo_url: logo_url,
    });
    if (setErr) {
      const colMissing = String(setErr.message ?? "").toLowerCase().includes("logo_url") || setErr.code === "42883";
      if (colMissing) {
        return NextResponse.json(
          {
            error: "RPC/coluna de logo ausente. Execute web/scripts/add-calculadora-assinante-logo.sql no Supabase.",
            code: "LOGO_COLUNA_SQL",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, logo_url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: url } = await supabaseAdmin.rpc("fn_calculadora_assinante_logo_get", {
      p_assinante_id: assinante.id,
    });
    if (url) {
      const p = storagePathFromPublicUrl(String(url));
      if (p) {
        await supabaseAdmin.storage.from(BUCKET).remove([p]).catch(() => {});
      }
    }

    const { error: setErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_logo_set", {
      p_assinante_id: assinante.id,
      p_logo_url: null,
    });
    if (setErr) {
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
