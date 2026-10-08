/**
 * GET/POST /api/cron/gestores-ia-avulso-ulisses — roda o diagnóstico do Ulisses todo dia pra
 * todo assinante avulso com ML conectado. Síncrono, zero custo de IA (gestor 100% código,
 * mesma decisão do hub 2026-09-07) — maxDuration alto cobre uma base pequena de assinantes
 * rodando em sequência.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rodarUlissesAvulsoParaAssinante } from "@/lib/ai/gestorAvulsoUlissesRodar";

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
      const r = await rodarUlissesAvulsoParaAssinante(a.id);
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
