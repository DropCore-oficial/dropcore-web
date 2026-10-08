/**
 * GET/POST/DELETE /api/gestores-ia-avulso/byok — assinante cadastra/remove a própria chave
 * da Anthropic (BYOK). Com chave própria configurada, o teto diário de R$4 da casa deixa de
 * valer (`temOrcamentoDisponivelHoje` em gestorAvulsoOrcamento.ts) e o cron passa a submeter
 * o batch do Andrey com a chave do assinante (gestorAvulsoBatchSubmit.ts) — ainda com os 50%
 * de desconto da Batch API, só que o gasto sai da conta Anthropic dele, não do DropCore.
 *
 * Nunca devolve a chave de volta pro front (nem na GET) — só se está configurada ou não.
 * GET lê via RPC (fn_calculadora_assinante_byok_configurado, 2026-10-07) — ver
 * docs/SCHEMA.md "Ulisses avulso ... 1º uso real de RPC".
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { encryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";
import { MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data } = await supabaseAdmin.rpc("fn_calculadora_assinante_byok_configurado", {
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
    return NextResponse.json({ error: "Cole a chave da Anthropic." }, { status: 422 });
  }

  // Testa a chave de verdade antes de salvar — 1 token de saída, custo irrisório, sai da
  // chave do próprio assinante (não do DropCore). Evita salvar chave inválida/revogada e só
  // descobrir no cron do dia seguinte.
  try {
    const cliente = new Anthropic({ apiKey });
    await cliente.messages.create({
      model: MODELO_GESTORES_IA,
      max_tokens: 1,
      messages: [{ role: "user", content: "oi" }],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao validar a chave.";
    return NextResponse.json({ error: `Chave inválida ou sem acesso ao modelo: ${msg}` }, { status: 422 });
  }

  const { error } = await supabaseAdmin
    .from("calculadora_assinantes")
    .update({ anthropic_api_key_encriptada: encryptCalculadoraAssinanteSecret(apiKey) })
    .eq("id", assinante.id);
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

  const { error } = await supabaseAdmin
    .from("calculadora_assinantes")
    .update({ anthropic_api_key_encriptada: null })
    .eq("id", assinante.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
