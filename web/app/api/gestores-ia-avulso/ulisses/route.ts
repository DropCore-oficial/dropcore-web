/**
 * GET /api/gestores-ia-avulso/ulisses — última rodada do Ulisses (Ads/Preço) pro assinante
 * avulso + status de ML/preferências. Sem uso de tokens de IA (gestor 100% código), então
 * não devolve `uso_tokens_hoje` como Andrey/Amanda. Leitura via RPC
 * (fn_calculadora_assinante_ai_runs_recentes/ml_status_get, 2026-10-07).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { buscarPreferenciasUlissesAvulso } from "@/lib/ai/gestorAdsDadosAvulso";

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

  const [{ data: ml }, { data: runsRecentes }, preferencias] = await Promise.all([
    supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", { p_assinante_id: assinante.id }),
    supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
      p_assinante_id: assinante.id,
      p_gestor: "ads",
      p_limit: 1,
    }),
    buscarPreferenciasUlissesAvulso(assinante.id),
  ]);
  const run = ((runsRecentes ?? []) as RunRow[])[0] ?? null;

  return NextResponse.json({
    ml_conectado: Boolean(ml?.ml_user_id),
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
