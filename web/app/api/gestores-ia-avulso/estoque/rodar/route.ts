/**
 * POST /api/gestores-ia-avulso/estoque/rodar — botão "Rodar de novo agora" do Estoque pro
 * assinante avulso. Sempre síncrono, zero custo de IA (gestor 100% código) — mas ainda
 * respeita o orçamento diário compartilhado (ver `gestorAvulsoEstoqueRodar.ts`): quando o
 * pote do dia esgota, o Estoque para junto com o resto da equipe, por decisão de produto,
 * não porque ele mesmo gaste token. Lógica reaproveitada pelo cron diário
 * (app/api/cron/gestores-ia-avulso-estoque/route.ts). Resposta final via RPC genérica de
 * leitura, nunca `.from()` direto (1º gestor avulso escrito depois da regra 9).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { rodarEstoqueAvulsoParaAssinante, COOLDOWN_HORAS_ESTOQUE_AVULSO } from "@/lib/ai/gestorAvulsoEstoqueRodar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  cooldown: `Aguarde pra rodar o Estoque de novo (até ${COOLDOWN_HORAS_ESTOQUE_AVULSO}h entre rodadas).`,
  orcamento_estourado: "Limite diário de IA incluso no plano foi atingido. Ele renova à meia-noite.",
  sem_dado_suficiente: "Conecte sua conta do Mercado Livre antes de rodar o Estoque.",
  assinante_nao_encontrado: "Erro ao carregar orçamento.",
};

type RunRow = { id: string; status: string; resultado: unknown; erro: string | null; criado_em: string };

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
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes de rodar o Estoque." }, { status: 422 });
  }

  const resultado = await rodarEstoqueAvulsoParaAssinante(assinante.id);
  if (!resultado.ok) {
    const status = resultado.motivo === "cooldown" ? 429 : resultado.motivo === "orcamento_estourado" ? 402 : 422;
    return NextResponse.json({ error: MENSAGEM_POR_MOTIVO[resultado.motivo] ?? resultado.motivo }, { status });
  }

  const { data: runsRecentes } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
    p_assinante_id: assinante.id,
    p_gestor: "estoque",
    p_limit: 1,
  });
  const novaLinha = ((runsRecentes ?? []) as RunRow[])[0];

  return NextResponse.json({
    ok: true,
    run: novaLinha
      ? {
          id: novaLinha.id,
          status: novaLinha.status,
          resultado: novaLinha.resultado,
          erro_mensagem: novaLinha.erro,
          executado_em: novaLinha.criado_em,
        }
      : null,
  });
}
