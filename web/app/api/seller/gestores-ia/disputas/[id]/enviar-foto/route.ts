/**
 * POST /api/seller/gestores-ia/disputas/[id]/enviar-foto — seller sobe a foto que ele
 * conseguiu ver na própria reclamação do Mercado Livre (a DropCore não consegue baixar
 * essa evidência direto pela API — ver docs/SCHEMA.md). Vai pro bucket privado
 * `disputas-evidencias` (nunca público), e dispara a análise por visão da Amanda em
 * seguida. Valida que o caso é desse seller antes de aceitar.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { DISPUTAS_EVIDENCIAS_BUCKET, analisarEvidenciaFoto } from "@/lib/ai/gestorDisputasFornecedorDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { id } = await params;
  const { data: disputa, error: fetchErr } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .select("id, seller_id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !disputa) {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }
  if (disputa.seller_id !== seller.id) {
    return NextResponse.json({ error: "Esse caso não pertence à sua conta." }, { status: 403 });
  }
  if (disputa.status === "decidido") {
    return NextResponse.json({ error: "Esse caso já foi encerrado." }, { status: 409 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo de imagem obrigatório." }, { status: 400 });
  }
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return NextResponse.json({ error: "Tipo inválido. Use JPEG, PNG ou WebP." }, { status: 400 });
  }
  if (file.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "Imagem deve ter no máximo 5 MB." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${seller.id}/${id}/evidencia.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(DISPUTAS_EVIDENCIAS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const agora = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .update({ evidencia_seller_path: path, evidencia_seller_enviada_em: agora })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Análise por visão é best-effort — se falhar, o caso continua "indeterminado" e o admin
  // decide manualmente, não bloqueia a confirmação do upload pro seller.
  try {
    await analisarEvidenciaFoto(id);
  } catch (e) {
    console.error("[enviar-foto] análise de evidência falhou", e);
  }

  return NextResponse.json({ ok: true });
}
