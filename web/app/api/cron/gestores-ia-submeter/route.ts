/**
 * GET/POST /api/cron/gestores-ia-submeter
 * Cron A dos Gestores de IA: submete o batch diário (Anthropic Batch API) pro gestor piloto
 * "Risco de Ruptura & Fulfillment", 1 request por seller Pro/Elite elegível.
 * Agendamento: Supabase pg_cron (web/scripts/supabase-cron-jobs.sql), não Vercel Cron.
 */
import { NextResponse } from "next/server";
import { submeterGestoresIaDiario } from "@/lib/ai/gestorBatchSubmit";

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

  try {
    const result = await submeterGestoresIaDiario();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
