/**
 * POST /api/gestores-ia-avulso/tiago/nova-sessao — botão "Nova conversa" no chat do Tiago
 * avulso.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: sessionId, error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_criar_sessao", {
    p_assinante_id: assinante.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, session_id: sessionId });
}
