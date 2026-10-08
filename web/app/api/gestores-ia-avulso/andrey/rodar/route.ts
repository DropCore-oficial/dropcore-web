/**
 * POST /api/gestores-ia-avulso/andrey/rodar — botão "Rodar análise" do Andrey pro assinante
 * avulso. Sempre síncrono (sem Batch API — o assinante espera na hora, mesmo padrão do botão
 * "rodar de novo agora" do hub, ver app/api/seller/gestores-ia/rodar/route.ts).
 * Lógica de verdade (cooldown, orçamento, busca de dado, chamada à Anthropic) foi extraída
 * pra `lib/ai/gestorAvulsoAndreyRodar.ts` em 2026-10-07 — reaproveitada também pelo cron
 * diário (`app/api/cron/gestores-ia-avulso-andrey/route.ts`), pra nunca dessincronizar.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { rodarAndreyAvulsoParaAssinante, COOLDOWN_HORAS_ANDREY_AVULSO } from "@/lib/ai/gestorAvulsoAndreyRodar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  cooldown: `Aguarde pra rodar o Andrey de novo (até ${COOLDOWN_HORAS_ANDREY_AVULSO}h entre rodadas).`,
  orcamento_estourado: "Limite diário de IA incluso no plano foi atingido. Ele renova à meia-noite.",
  sem_anuncio_elegivel:
    "Nenhum anúncio elegível agora — ou é tudo muito novo (menos de 30 dias no ar), ou nada mudou em vendas desde a última checagem.",
  sem_api_key: "ANTHROPIC_API_KEY não configurada.",
  assinante_nao_encontrado: "Erro ao carregar orçamento.",
};

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: ml } = await supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", {
    p_assinante_id: assinante.id,
  });
  if (!ml?.ml_user_id) {
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes de rodar o Andrey." }, { status: 422 });
  }

  const resultado = await rodarAndreyAvulsoParaAssinante(assinante.id);
  if (!resultado.ok) {
    const status = resultado.motivo === "cooldown" ? 429 : resultado.motivo === "orcamento_estourado" ? 402 : 422;
    return NextResponse.json(
      { error: MENSAGEM_POR_MOTIVO[resultado.motivo] ?? resultado.motivo },
      { status }
    );
  }

  const { data: novaLinha } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("id, status, resultado, erro, criado_em")
    .eq("id", resultado.runId)
    .single();

  return NextResponse.json({
    ok: true,
    run: {
      id: novaLinha?.id,
      status: novaLinha?.status,
      resultado: novaLinha?.resultado,
      erro_mensagem: novaLinha?.erro,
      executado_em: novaLinha?.criado_em,
    },
  });
}
