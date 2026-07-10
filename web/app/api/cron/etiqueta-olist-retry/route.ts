/**
 * GET/POST /api/cron/etiqueta-olist-retry — retry dedicado da etiqueta real de envio (Olist).
 * A tentativa original (web/lib/sellerOlistPedidoImport.ts) só roda uma vez, no momento da
 * importação/promoção do pedido; este cron insiste até conseguir e alerta os admins da org
 * se continuar falhando. Agendamento: Supabase pg_cron a cada 15 min
 * (web/scripts/add-etiqueta-olist-retry-cron.sql).
 */
import { NextResponse } from "next/server";
import { runEtiquetaOlistRetry } from "@/lib/etiquetaOlistRetry";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_etiqueta_olist_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_etiqueta_olist_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/etiqueta-olist-retry] lock RPC ausente — rode add-etiqueta-olist-retry-cron.sql");
    } else {
      console.error("[cron/etiqueta-olist-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "retry_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await runEtiquetaOlistRetry();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/etiqueta-olist-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no retry de etiqueta Olist." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_etiqueta_olist_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
