/**
 * GET/POST /api/cron/pedidos-postado-auto-retry — Frente 3: promove pedido "enviado" pra
 * "aguardando_repasse" sozinho quando a Olist já mostra situação "enviado"/"entregue"
 * (o marketplace avisa a Olist automaticamente quando o pedido é despachado). Sem isso, só
 * o fornecedor/admin clicando manualmente move o pedido pra frente. Agendamento: Supabase
 * pg_cron a cada 30 min (web/scripts/add-pedidos-postado-auto-retry-cron.sql).
 */
import { NextResponse } from "next/server";
import { runPedidosEnviadoAutoPostadoRetry } from "@/lib/pedidosEnviadoAutoPostadoRetry";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_pedidos_postado_auto_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_pedidos_postado_auto_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/pedidos-postado-auto-retry] lock RPC ausente — rode add-pedidos-postado-auto-retry-cron.sql");
    } else {
      console.error("[cron/pedidos-postado-auto-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "retry_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await runPedidosEnviadoAutoPostadoRetry();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/pedidos-postado-auto-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no auto-postado." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_pedidos_postado_auto_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
