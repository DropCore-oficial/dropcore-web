/**
 * GET/POST /api/cron/ml-sync-retry — reprocessa falhas registradas em ml_sync_falhas (push
 * de estoque ou ingestão de pedido do ML que falharam antes).
 * Agendamento: Supabase pg_cron a cada 15 min
 * (web/scripts/create-ml-sync-falhas-log-retry.sql).
 */
import { NextResponse } from "next/server";
import { runMlSyncRetry } from "@/lib/mlSyncRetry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_ml_sync_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_ml_sync_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/ml-sync-retry] lock RPC ausente — rode create-ml-sync-falhas-log-retry.sql");
    } else {
      console.error("[cron/ml-sync-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const summary = await runMlSyncRetry();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    console.error("[cron/ml-sync-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no retry de sync ML." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_ml_sync_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
