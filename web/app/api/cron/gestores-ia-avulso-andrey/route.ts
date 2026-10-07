/**
 * GET/POST /api/cron/gestores-ia-avulso-andrey — roda o diagnóstico do Andrey todo dia pra
 * todo assinante avulso com ML conectado. Antes dessa rota (2026-10-07) o Andrey avulso só
 * rodava quando o assinante clicava manualmente em "Rodar de novo agora" — nenhum cron
 * cobria o produto avulso (só o hub tinha gestores-ia-submeter/resultado, filtrado por
 * seller). Síncrono por assinante (mesmo padrão do botão manual, sem Batch API) — maxDuration
 * alto cobre uma base pequena de assinantes rodando em sequência.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rodarAndreyAvulsoParaAssinante } from "@/lib/ai/gestorAvulsoAndreyRodar";

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

  const resultados: { assinante_id: string; ok: boolean; motivo?: string }[] = [];
  for (const a of assinantes ?? []) {
    try {
      const r = await rodarAndreyAvulsoParaAssinante(a.id);
      resultados.push(r.ok ? { assinante_id: a.id, ok: true } : { assinante_id: a.id, ok: false, motivo: r.motivo });
    } catch (e) {
      resultados.push({
        assinante_id: a.id,
        ok: false,
        motivo: e instanceof Error ? e.message : "erro_desconhecido",
      });
    }
  }

  return NextResponse.json({ ok: true, total: resultados.length, resultados });
}
