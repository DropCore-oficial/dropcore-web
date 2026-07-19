/**
 * GET/POST /api/cron/pedidos-bloqueados-retry — rede de segurança catch-all.
 * Reavalia pedidos `bloqueado` que os gatilhos pontuais (habilitar SKU, reimport
 * duplicado Olist/Bling) não pegaram, e também pedidos `pendente_estoque` (mesmo
 * problema: só saem desse status via reimport duplicado, que não acontece se o
 * pedido já saiu da janela de busca do sync). Agendamento: Supabase pg_cron a cada
 * 15 min (web/scripts/add-pedidos-bloqueados-retry-cron.sql).
 */
import { NextResponse } from "next/server";
import { runPedidosBloqueadosRetry } from "@/lib/pedidosBloqueadosRetry";
import { runPedidosPendenteEstoqueRetry } from "@/lib/pedidosPendenteEstoqueRetry";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_pedidos_bloqueados_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_pedidos_bloqueados_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/pedidos-bloqueados-retry] lock RPC ausente — rode add-pedidos-bloqueados-retry-cron.sql");
    } else {
      console.error("[cron/pedidos-bloqueados-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "retry_anterior_ainda_em_andamento",
    });
  }

  try {
    const bloqueados = await runPedidosBloqueadosRetry();
    const pendenteEstoque = await runPedidosPendenteEstoqueRetry();
    return NextResponse.json({ ok: true, bloqueados, pendente_estoque: pendenteEstoque });
  } catch (e: unknown) {
    console.error("[cron/pedidos-bloqueados-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no retry de pedidos bloqueados." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_pedidos_bloqueados_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
