/**
 * GET/POST /api/cron/olist-sync — sync automático pedidos Olist/Tiny (todos os sellers com token).
 * Agendamento: Supabase pg_cron a cada 1 min (web/scripts/supabase-cron-jobs.sql).
 */
import { NextResponse } from "next/server";
import { runSellerOlistSync } from "@/lib/sellerOlistSync";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_olist_sync_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_olist_sync_lock") || lockErr.code === "42883") {
      console.warn("[cron/olist-sync] lock RPC ausente — rode supabase-cron-jobs.sql");
    } else {
      console.error("[cron/olist-sync] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "sync_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await runSellerOlistSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/olist-sync]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no sync Olist/Tiny." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_olist_sync_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
