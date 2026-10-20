/**
 * GET /api/gestores-ia-avulso/design — Laura (Design) não tem rodada/cron própria: ela só é
 * chamada por dentro da rodada do Anúncio (`gestorAnunciosSeoDadosAvulso.ts`), quando o funil
 * de conversão esgota todas as outras causas checáveis por código. Essa rota só LÊ o que o
 * Anúncio já salvou e filtra os anúncios que têm `foto_diagnostico` — página 100% passiva.
 * Leitura via RPC (`fn_calculadora_assinante_ai_runs_recentes`), nunca `.from()` direto
 * (regra 9 do CLAUDE.md).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnuncioComFoto = {
  chave: string;
  item_id_representante: string;
  familia_nome: string | null;
  foto_diagnostico: { veredito: "boa" | "ruim"; motivo: string; picture_ids: string[] } | null;
};

type RunRow = { resultado: { anuncios?: AnuncioComFoto[] } | null; criado_em: string };

export async function GET(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const [{ data: ml }, { data: runsRecentes }] = await Promise.all([
    supabaseAdmin.rpc("fn_calculadora_assinante_ml_status_get", { p_assinante_id: assinante.id }),
    supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
      p_assinante_id: assinante.id,
      p_gestor: "anuncios_seo",
      p_limit: 1,
    }),
  ]);

  const run = ((runsRecentes ?? []) as RunRow[])[0] ?? null;
  // `!== null` não bastava: rodada salva ANTES do campo `foto_diagnostico` existir não tem a
  // chave, então vem `undefined` — e `undefined !== null` é `true`, incluindo todo anúncio
  // de rodada antiga na lista sem nenhum diagnóstico de verdade (achado ao vivo 2026-10-20,
  // página mostrando item sem badge/motivo nenhum). `Boolean(...)` cobre os dois casos.
  const anunciosComFoto = (run?.resultado?.anuncios ?? []).filter((a) => Boolean(a.foto_diagnostico));

  return NextResponse.json({
    ml_conectado: Boolean(ml?.ml_user_id),
    anuncios: anunciosComFoto,
    executado_em: run?.criado_em ?? null,
  });
}
