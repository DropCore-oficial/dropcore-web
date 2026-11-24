/**
 * GET/POST /api/cron/ml-sync-reconciliacao-completa — reenvia o estoque real de TODO SKU
 * mapeado de TODO seller conectado ao ML, mesmo sem nenhuma venda/reposição ter disparado o
 * sync reativo. Agendamento: pg_cron a cada 30 min — separado do cron de 1 minuto de
 * propósito (essa rotina é pesada, toca em todo SKU de todo seller numa rodada só, e rodar
 * tão frequente quanto o resto bateria rate limit do ML). Ver lib/mlSyncReconciliacaoCompleta.ts.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runMlSyncReconciliacaoCompleta } from "@/lib/mlSyncReconciliacaoCompleta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  return (req.headers.get("x-cron-secret")?.trim() ?? "") === secret;
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_ml_sync_reconciliacao_completa_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (!msg.includes("dropcore_try_ml_sync_reconciliacao_completa_lock") && lockErr.code !== "42883") {
      console.error("[cron/ml-sync-reconciliacao-completa] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const result = await runMlSyncReconciliacaoCompleta();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/ml-sync-reconciliacao-completa]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_ml_sync_reconciliacao_completa_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
