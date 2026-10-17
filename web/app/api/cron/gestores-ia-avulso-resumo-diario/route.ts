/**
 * GET/POST /api/cron/gestores-ia-avulso-resumo-diario — "reunião matinal": roda depois que os
 * 4 gestores avulso (Anúncio 8h, SAC 8h15, ADS 8h30, Estoque 8h45) já terminaram, monta o
 * resumo de top 3 ações (`montarResumoDiarioAvulso`, zero custo de IA, só lê rodadas já
 * salvas) e notifica o assinante (sino + e-mail) quando há proposta de verdade. Mesmo padrão
 * de filtro de assinante elegível do cron do Estoque.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarResumoDiarioAvulso } from "@/lib/ai/gestorTiagoResumoDiarioAvulso";
import { notificarAssinanteResumoDiarioAvulso } from "@/lib/ai/gestorNotificacaoAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: assinantes, error } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("id, calculadora_assinante_mercadolivre_integrations!inner(ml_user_id)")
    .eq("inclui_gestores_ia", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultados: { assinante_id: string; ok: boolean; notificado: boolean; motivo?: string }[] = [];
  for (const a of assinantes ?? []) {
    try {
      const resumo = await montarResumoDiarioAvulso(a.id);
      await notificarAssinanteResumoDiarioAvulso(a.id, resumo.top3);
      resultados.push({ assinante_id: a.id, ok: true, notificado: resumo.top3.length > 0 });
    } catch (e) {
      resultados.push({
        assinante_id: a.id,
        ok: false,
        notificado: false,
        motivo: e instanceof Error ? e.message : "erro_desconhecido",
      });
    }
  }

  return NextResponse.json({ ok: true, total: resultados.length, resultados });
}
