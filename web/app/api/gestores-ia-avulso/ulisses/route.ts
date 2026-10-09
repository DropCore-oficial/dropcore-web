/**
 * GET /api/gestores-ia-avulso/ulisses — última rodada do Ulisses (Ads/Preço) pro assinante
 * avulso + status de ML/preferências. O Ulisses em si não gasta token de IA (100% código),
 * mas `uso_tokens_hoje` devolvido aqui é o orçamento diário COMPARTILHADO da conta (mesmo
 * cálculo de Andrey/Amanda) — pedido explícito pra barra aparecer em toda página do avulso,
 * não só nos gestores que de fato consomem. Leitura via RPC
 * (fn_calculadora_assinante_ai_runs_recentes/ml_status_get, 2026-10-07).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { buscarPreferenciasUlissesAvulso } from "@/lib/ai/gestorAdsDadosAvulso";
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

  const [{ data: ml }, { data: runsRecentes }, preferencias, { data: byok }] = await Promise.all([
    supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", { p_assinante_id: assinante.id }),
    supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
      p_assinante_id: assinante.id,
      p_gestor: "ads",
      p_limit: 1,
    }),
    buscarPreferenciasUlissesAvulso(assinante.id),
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
    preferencias_configuradas: preferencias !== null,
    preferencias: preferencias
      ? {
          margem_minima_pct: preferencias.margemMinimaPct,
          margem_maxima_pct: preferencias.margemMaximaPct,
          imposto_pct: preferencias.impostoPct,
          perda_pct: preferencias.perdaPct,
        }
      : null,
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
