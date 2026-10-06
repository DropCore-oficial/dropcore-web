/**
 * GET /api/gestores-ia-avulso/mercadolivre — status da conexão ML do assinante avulso.
 * DELETE — desconecta (remove a linha).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("calculadora_assinante_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token_expires_at, updated_at")
    .eq("assinante_id", assinante.id)
    .maybeSingle();

  if (error) {
    console.error("[gestores-ia-avulso/mercadolivre GET]", error.message);
    return NextResponse.json({ error: "Erro ao carregar integração Mercado Livre." }, { status: 500 });
  }

  return NextResponse.json({
    connected: Boolean(data?.ml_user_id),
    ml_user_id: data?.ml_user_id ?? null,
    access_token_expires_at: data?.ml_access_token_expires_at ?? null,
    updated_at: data?.updated_at ?? null,
  });
}

export async function DELETE(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("calculadora_assinante_mercadolivre_integrations")
    .delete()
    .eq("assinante_id", assinante.id);

  if (error) {
    console.error("[gestores-ia-avulso/mercadolivre DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao desconectar o Mercado Livre." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, connected: false });
}
