/**
 * GET/POST /api/cron/olist-sync-precos — atualiza preços/custos na Olist para todos os sellers conectados.
 * Agendamento sugerido: a cada 30 min (supabase-cron-jobs.sql).
 */
import { NextResponse } from "next/server";
import { runOlistSyncPrecosTodosSellers } from "@/lib/runOlistSyncPrecosTodosSellers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const cronHeader = req.headers.get("x-vercel-cron")?.trim();
  if (cronHeader === "1" && auth === `Bearer ${secret}`) return true;

  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const result = await runOlistSyncPrecosTodosSellers();
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    console.error("[cron/olist-sync-precos]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no sync de preços Olist." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
