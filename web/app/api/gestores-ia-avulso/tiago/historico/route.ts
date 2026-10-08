/**
 * GET /api/gestores-ia-avulso/tiago/historico — carrega a tela do chat (sessões + mensagens
 * da sessão ativa) numa chamada só (fn_calculadora_assinante_ai_chat_historico) + uso do
 * orçamento diário compartilhado (mesmo pote do Andrey/Amanda/Ulisses, não um contador
 * próprio). ?session_id=... pra trocar de conversa (senão pega a mais recente). Sessão nova
 * automática por dia, mesmo princípio do hub (app/api/seller/gestores-ia/tiago/historico).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { TOKENS_POR_REAL_ESTIMADO } from "@/lib/ai/gestorTiagoChatCusto";
import { hojeBrtIso, dataBrtDeIso } from "@/lib/ai/gestorTiagoChatOrcamentoDia";
import { gastoAvulsoHojeReais, TETO_AVULSO_REAIS_DIA, COTA_TOKENS_DIA_ESTIMADA_AVULSO } from "@/lib/ai/gestorAvulsoOrcamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoricoData = {
  sessoes: { id: string; titulo: string | null; criado_em: string; atualizado_em: string }[];
  sessao_ativa_id: string | null;
  mensagens: unknown[];
};

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ liberado: false });
  }

  const url = new URL(req.url);
  const sessionIdParam = url.searchParams.get("session_id") || null;

  const historicoRes = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_historico", {
    p_assinante_id: assinante.id,
    p_session_id: sessionIdParam,
  });
  if (historicoRes.error) {
    return NextResponse.json({ error: historicoRes.error.message }, { status: 400 });
  }
  let historicoData = historicoRes.data as HistoricoData;

  if (!sessionIdParam) {
    const sessaoAtiva = historicoData.sessoes.find((s) => s.id === historicoData.sessao_ativa_id);
    const sessaoEhDeHoje = sessaoAtiva ? dataBrtDeIso(sessaoAtiva.criado_em) === hojeBrtIso() : false;
    if (!sessaoEhDeHoje) {
      const { data: novaSessaoId, error: criarErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_criar_sessao", {
        p_assinante_id: assinante.id,
      });
      if (!criarErr && novaSessaoId) {
        const historicoRes2 = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_historico", {
          p_assinante_id: assinante.id,
          p_session_id: novaSessaoId,
        });
        if (!historicoRes2.error) historicoData = historicoRes2.data as HistoricoData;
      }
    }
  }

  const { data: byokRaw } = await supabaseAdmin.rpc("fn_calculadora_assinante_byok_configurado", {
    p_assinante_id: assinante.id,
  });
  const byok = Boolean(byokRaw);
  const gastoHoje = byok ? 0 : await gastoAvulsoHojeReais(assinante.id);
  const bloqueadoHoje = !byok && gastoHoje >= TETO_AVULSO_REAIS_DIA;

  return NextResponse.json({
    liberado: true,
    ...historicoData,
    bloqueado_hoje: bloqueadoHoje,
    uso_tokens_hoje: byok
      ? null
      : { tokens: Math.round(gastoHoje * TOKENS_POR_REAL_ESTIMADO), cota: COTA_TOKENS_DIA_ESTIMADA_AVULSO },
  });
}
