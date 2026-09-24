/**
 * GET/POST /api/cron/pedidos-sla-despacho-check — SLA de postagem por marketplace (Fase 2,
 * v1 só notifica, sem penalidade). Verifica pedidos "enviado" cujo `sla_prazo_despacho`
 * (calculado a partir da etiqueta impressa — Shopee/Shein/TikTok — ou buscado direto na API
 * do ML) já passou, e ainda não postados. Agendamento: Supabase pg_cron a cada 30 min
 * (web/scripts/add-pedidos-sla-despacho-check-cron.sql).
 */
import { NextResponse } from "next/server";
import { verificarPedidosSlaAtrasados } from "@/lib/pedidoSlaAtrasoCheck";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_pedidos_sla_despacho_check_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_pedidos_sla_despacho_check_lock") || lockErr.code === "42883") {
      console.warn("[cron/pedidos-sla-despacho-check] lock RPC ausente — rode add-pedidos-sla-despacho-check-cron.sql");
    } else {
      console.error("[cron/pedidos-sla-despacho-check] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const result = await verificarPedidosSlaAtrasados();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/pedidos-sla-despacho-check]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no check de SLA." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_pedidos_sla_despacho_check_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
