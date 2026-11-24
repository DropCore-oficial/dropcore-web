/**
 * GET/POST /api/cron/ml-sync-alerta-admin — avisa owners/admins da org quando um
 * seller/fornecedor acumula falha recorrente de sync com o ML (pendente ou esgotada).
 * Agendamento: pg_cron a cada 10 min (não precisa ser 1min como o sync em si — é alerta,
 * não o sync). Ver lib/mlSyncAlertaAdmin.ts.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runMlSyncAlertaAdmin } from "@/lib/mlSyncAlertaAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_ml_sync_alerta_admin_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (!msg.includes("dropcore_try_ml_sync_alerta_admin_lock") && lockErr.code !== "42883") {
      console.error("[cron/ml-sync-alerta-admin] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const result = await runMlSyncAlertaAdmin();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/ml-sync-alerta-admin]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_ml_sync_alerta_admin_lock");
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
