/**
 * GET/POST /api/cron/pedidos-erro-saldo-retry — rede de segurança catch-all.
 * Reavalia pedidos `erro_saldo` que o gatilho pontual (recarga de crédito / aprovação
 * PIX) não pegou, e expira (devolve estoque, cancela) os parados há mais de 48h.
 * Agendamento: Supabase pg_cron a cada 1 min (web/scripts/add-pedidos-erro-saldo-retry-cron.sql).
 */
import { NextResponse } from "next/server";
import { runPedidosErroSaldoRetry } from "@/lib/pedidosErroSaldoRetry";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_pedidos_erro_saldo_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_pedidos_erro_saldo_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/pedidos-erro-saldo-retry] lock RPC ausente — rode add-pedidos-erro-saldo-retry-cron.sql");
    } else {
      console.error("[cron/pedidos-erro-saldo-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "retry_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await runPedidosErroSaldoRetry();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/pedidos-erro-saldo-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no retry de pedidos erro_saldo." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_pedidos_erro_saldo_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
