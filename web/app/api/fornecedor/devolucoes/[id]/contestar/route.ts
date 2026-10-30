/**
 * POST /api/fornecedor/devolucoes/[id]/contestar — fornecedor contesta a devolução (defeito,
 * produto errado, não recebeu nada). Recebe texto obrigatório + foto opcional (FormData,
 * mesmo padrão de validação/upload de .../gestores-ia/disputas/[id]/enviar-foto). Trava a
 * liberação automática de 48h — o caso cai pro admin decidir manual.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "disputas-evidencias";
const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const formData = await req.formData().catch(() => null);
  const texto = formData?.get("texto")?.toString().trim();
  if (!texto) {
    return NextResponse.json({ error: "Explique o que aconteceu." }, { status: 400 });
  }

  let fotoPath: string | null = null;
  const file = formData?.get("foto");
  if (file instanceof File && file.size > 0) {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de imagem inválido. Use JPEG, PNG ou WebP." }, { status: 400 });
    }
    if (file.size > TAMANHO_MAXIMO) {
      return NextResponse.json({ error: "Imagem deve ter no máximo 5 MB." }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `fornecedor-contestacao/${id}/evidencia.${ext}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }
    fotoPath = path;
  }

  const { data, error } = await supabaseAdmin
    .rpc("fn_devolucao_fornecedor_contestar", {
      p_ledger_id: id,
      p_fornecedor_id: ctx.fornecedor_id,
      p_texto: texto,
      p_foto_path: fotoPath,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = data as { ok: boolean; motivo: string | null } | null;
  if (!resultado?.ok) {
    return NextResponse.json({ error: resultado?.motivo ?? "Não foi possível registrar a contestação." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mensagem: "Contestação registrada. O admin vai revisar o caso." });
}
