/**
 * GET /api/gestores-ia-avulso/andrey — última rodada do Andrey (Anúncios & SEO) pro
 * assinante avulso + conexão ML e uso diário de IA, pra tela saber o que mostrar.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { TOKENS_POR_REAL_ESTIMADO } from "@/lib/ai/gestorTiagoChatCusto";
import {
  gastoAvulsoHojeReais,
  chaveByokDoAssinante,
  TETO_AVULSO_REAIS_DIA,
  COTA_TOKENS_DIA_ESTIMADA_AVULSO,
  type AssinanteByok,
} from "@/lib/ai/gestorAvulsoOrcamento";

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

  const [{ data: ml }, { data: runsRecentes }, { data: assinanteByok }] = await Promise.all([
    supabaseAdmin
      .from("calculadora_assinante_mercadolivre_integrations")
      .select("ml_user_id")
      .eq("assinante_id", assinante.id)
      .maybeSingle(),
    supabaseAdmin
      .from("calculadora_assinante_ai_runs")
      .select("id, status, resultado, erro, criado_em")
      .eq("assinante_id", assinante.id)
      .eq("gestor", "anuncios_seo")
      .order("criado_em", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("calculadora_assinantes")
      .select("anthropic_api_key_encriptada")
      .eq("id", assinante.id)
      .maybeSingle<AssinanteByok>(),
  ]);

  // "Ideias pra produto novo" grava uma linha nesse mesmo gestor só pra contar no
  // orçamento diário (ver ideias-produto-novo/route.ts) — marcada com
  // resultado.tipo === "ideias_produto_novo", não é um diagnóstico de verdade. Pula essas
  // linhas pra achar a última rodada real (inclusive se ela deu erro).
  const run = (runsRecentes ?? []).find(
    (r) => (r.resultado as { tipo?: string } | null)?.tipo !== "ideias_produto_novo"
  );

  const byok = assinanteByok ? chaveByokDoAssinante(assinanteByok) !== null : false;
  const gastoHoje = byok || !assinanteByok ? 0 : await gastoAvulsoHojeReais(assinante.id);
  const bloqueadoHoje = !byok && gastoHoje >= TETO_AVULSO_REAIS_DIA;

  return NextResponse.json({
    ml_conectado: Boolean(ml?.ml_user_id),
    run: run
      ? {
          id: run.id,
          status: run.status,
          resultado: run.resultado,
          erro_mensagem: run.erro,
          executado_em: run.criado_em,
        }
      : null,
    uso_tokens_hoje: byok
      ? null
      : { tokens: Math.round(gastoHoje * TOKENS_POR_REAL_ESTIMADO), cota: COTA_TOKENS_DIA_ESTIMADA_AVULSO },
    bloqueado_hoje: bloqueadoHoje,
  });
}
