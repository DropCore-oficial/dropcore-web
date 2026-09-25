/**
 * GET/POST /api/cron/anuncio-sem-sku-retry — tenta promover pedidos `anuncio_sem_sku`
 * (anúncio do ML sem SKU cadastrado) quando o seller corrigir o anúncio, e dispara alerta
 * de urgência perto do prazo de despacho. Agendamento: Supabase pg_cron a cada 15 min
 * (web/scripts/add-anuncio-sem-sku-retry-cron.sql).
 */
import { NextResponse } from "next/server";
import { runAnuncioSemSkuRetry } from "@/lib/anuncioSemSkuRetry";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_anuncio_sem_sku_retry_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_anuncio_sem_sku_retry_lock") || lockErr.code === "42883") {
      console.warn("[cron/anuncio-sem-sku-retry] lock RPC ausente — rode add-anuncio-sem-sku-retry-cron.sql");
    } else {
      console.error("[cron/anuncio-sem-sku-retry] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "retry_anterior_ainda_em_andamento" });
  }

  try {
    const summary = await runAnuncioSemSkuRetry();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    console.error("[cron/anuncio-sem-sku-retry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no retry de anúncio sem SKU." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_anuncio_sem_sku_retry_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
