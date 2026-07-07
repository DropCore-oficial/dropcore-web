/**
 * GET/POST /api/cron/mensalidades-mp-sync
 * Confere no Mercado Pago mensalidades pendentes/inadimplentes e marca como pagas quando aprovadas.
 * Agendamento: a cada 5 min (supabase-cron-jobs.sql) — fallback ao webhook do MP.
 */
import { NextResponse } from "next/server";
import { runMensalidadesMpSyncTodasEntidades } from "@/lib/runMensalidadesMpSyncTodasEntidades";

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
    const result = await runMensalidadesMpSyncTodasEntidades();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/mensalidades-mp-sync]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
