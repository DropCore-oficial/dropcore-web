/**
 * POST /api/gestores-ia-avulso/ulisses/rodar — botão "Rodar de novo agora" do Ulisses pro
 * assinante avulso. Sempre síncrono, zero custo de IA (gestor 100% código). Lógica
 * reaproveitada pelo cron diário (app/api/cron/gestores-ia-avulso-ulisses/route.ts).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { rodarUlissesAvulsoParaAssinante, COOLDOWN_HORAS_ULISSES_AVULSO } from "@/lib/ai/gestorAvulsoUlissesRodar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  cooldown: `Aguarde pra rodar o Ulisses de novo (até ${COOLDOWN_HORAS_ULISSES_AVULSO}h entre rodadas).`,
  sem_dado_suficiente: "Conecte sua conta do Mercado Livre e configure as preferências antes de rodar o Ulisses.",
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
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes de rodar o Ulisses." }, { status: 422 });
  }

  const resultado = await rodarUlissesAvulsoParaAssinante(assinante.id);
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
