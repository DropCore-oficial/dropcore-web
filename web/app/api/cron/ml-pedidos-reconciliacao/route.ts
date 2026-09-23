/**
 * GET/POST /api/cron/ml-pedidos-reconciliacao — rede de segurança pro webhook do ML.
 * Agendamento: Supabase pg_cron a cada 15 min
 * (web/scripts/add-ml-pedidos-reconciliacao-cron.sql).
 */
import { NextResponse } from "next/server";
import { runMercadoLivrePedidosReconciliacao } from "@/lib/mercadoLivrePedidosReconciliacao";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_ml_pedidos_reconciliacao_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_ml_pedidos_reconciliacao_lock") || lockErr.code === "42883") {
      console.warn("[cron/ml-pedidos-reconciliacao] lock RPC ausente — rode add-ml-pedidos-reconciliacao-cron.sql");
    } else {
      console.error("[cron/ml-pedidos-reconciliacao] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const summary = await runMercadoLivrePedidosReconciliacao();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    console.error("[cron/ml-pedidos-reconciliacao]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado na reconciliação de pedidos ML." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_ml_pedidos_reconciliacao_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
