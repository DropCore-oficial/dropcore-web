/**
 * GET /api/gestores-ia-avulso/estoque — última rodada do Estoque pro assinante avulso +
 * status de ML. O Estoque não gasta token de IA (100% código), mas `uso_tokens_hoje`
 * devolvido aqui é o orçamento diário COMPARTILHADO da conta (mesmo cálculo de
 * Andrey/Amanda/Ulisses). Leitura 100% via RPC (1º gestor avulso escrito depois da regra 9
 * do CLAUDE.md — nunca `.from()` direto).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { TOKENS_POR_REAL_ESTIMADO } from "@/lib/ai/gestorTiagoChatCusto";
import { gastoAvulsoHojeReais, TETO_AVULSO_REAIS_DIA, COTA_TOKENS_DIA_ESTIMADA_AVULSO } from "@/lib/ai/gestorAvulsoOrcamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunRow = { id: string; status: string; resultado: unknown; erro: string | null; criado_em: string };

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const [{ data: ml }, { data: runsRecentes }, { data: byok }] = await Promise.all([
    supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", { p_assinante_id: assinante.id }),
    supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
      p_assinante_id: assinante.id,
      p_gestor: "estoque",
      p_limit: 1,
    }),
    supabaseAdmin.rpc("fn_calculadora_assinante_byok_configurado", { p_assinante_id: assinante.id }),
  ]);
  const run = ((runsRecentes ?? []) as RunRow[])[0] ?? null;

  const byokConfigurado = Boolean(byok);
  const gastoHoje = byokConfigurado ? 0 : await gastoAvulsoHojeReais(assinante.id);
  const bloqueadoHoje = !byokConfigurado && gastoHoje >= TETO_AVULSO_REAIS_DIA;

  return NextResponse.json({
    ml_conectado: Boolean(ml?.ml_user_id),
    uso_tokens_hoje: byokConfigurado
      ? null
      : { tokens: Math.round(gastoHoje * TOKENS_POR_REAL_ESTIMADO), cota: COTA_TOKENS_DIA_ESTIMADA_AVULSO },
    bloqueado_hoje: bloqueadoHoje,
    run: run
      ? {
          id: run.id,
          status: run.status,
          resultado: run.resultado,
          erro_mensagem: run.erro,
          executado_em: run.criado_em,
        }
      : null,
  });
}
