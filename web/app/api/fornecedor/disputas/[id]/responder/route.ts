/**
 * POST /api/fornecedor/disputas/[id]/responder — fornecedor registra a própria versão do
 * caso antes do admin decidir. Valida que o caso é dele mesmo (fornecedor_id bate com o
 * autenticado) antes de aceitar — nunca deixa um fornecedor responder caso de outro.
 * Não muda o status pra "decidido" — só o admin faz isso, ver
 * /api/org/gestores-ia/disputas/[id]/decidir.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { resposta?: string };
  const resposta = body.resposta?.trim();
  if (!resposta) {
    return NextResponse.json({ error: "resposta é obrigatória." }, { status: 400 });
  }

  const { data: caso, error: fetchErr } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .select("id, fornecedor_id, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !caso) {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }
  if (caso.fornecedor_id !== ctx.fornecedor_id) {
    return NextResponse.json({ error: "Esse caso não pertence à sua conta." }, { status: 403 });
  }
  if (caso.status === "decidido") {
    return NextResponse.json({ error: "Esse caso já foi decidido, não é mais possível responder." }, { status: 409 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .update({ fornecedor_resposta: resposta, fornecedor_respondeu_em: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
