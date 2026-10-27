/**
 * GET/POST/DELETE /api/gestores-ia-avulso/byok-gemini — assinante cadastra/remove a própria
 * chave do Google Gemini (BYOK), pro V2 da Laura (gestor Design) — geração de imagem via
 * Nano Banana Pro (Gemini 3 Pro Image). Mesmo princípio do BYOK da Anthropic
 * (`byok/route.ts`), mas código novo: leitura e escrita 100% por RPC (regra 9), nunca
 * `.from()`.
 *
 * Nunca devolve a chave de volta pro front (nem na GET) — só se está configurada ou não.
 */
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { encryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_byok_gemini_configurado", {
    p_assinante_id: assinante.id,
  });

  return NextResponse.json({ configurado: Boolean(data) });
}

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const apiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "Cole a chave do Gemini." }, { status: 422 });
  }

  // Testa a chave de verdade antes de salvar — mesmo princípio do BYOK da Anthropic: nunca
  // salvar chave inválida/revogada e só descobrir depois, quando a Laura precisar gerar foto.
  try {
    const client = new GoogleGenAI({ apiKey });
    await client.models.generateContent({
      model: "gemini-flash-latest",
      contents: "oi",
      config: { maxOutputTokens: 1 },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao validar a chave.";
    return NextResponse.json({ error: `Chave inválida ou sem acesso ao modelo: ${msg}` }, { status: 422 });
  }

  const { error } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_byok_gemini_upsert", {
    p_assinante_id: assinante.id,
    p_key_encriptada: encryptCalculadoraAssinanteSecret(apiKey),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { error } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_byok_gemini_delete", {
    p_assinante_id: assinante.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
