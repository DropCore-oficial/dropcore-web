/**
 * POST /api/gestores-ia-avulso/amanda/rodar — botão "Rodar de novo agora" da Amanda pro
 * assinante avulso. Sempre síncrono — diagnóstico é código puro (grátis) e só chama a
 * Anthropic quando há pergunta pendente de verdade (ver gestorAvulsoAmandaRodar.ts). Lógica
 * de verdade (cooldown, orçamento, busca de dado) reaproveitada pelo cron diário também
 * (app/api/cron/gestores-ia-avulso-amanda/route.ts), pra nunca dessincronizar.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { rodarAmandaAvulsoParaAssinante, COOLDOWN_HORAS_AMANDA_AVULSO } from "@/lib/ai/gestorAvulsoAmandaRodar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  cooldown: `Aguarde pra rodar a Amanda de novo (até ${COOLDOWN_HORAS_AMANDA_AVULSO}h entre rodadas).`,
  sem_ml_conectado_ou_sem_reputacao: "Conecte sua conta do Mercado Livre antes de rodar a Amanda.",
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
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes de rodar a Amanda." }, { status: 422 });
  }

  const resultado = await rodarAmandaAvulsoParaAssinante(assinante.id);
  if (!resultado.ok) {
    const status = resultado.motivo === "cooldown" ? 429 : 422;
    return NextResponse.json({ error: MENSAGEM_POR_MOTIVO[resultado.motivo] ?? resultado.motivo }, { status });
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
