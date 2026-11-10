/**
 * GET/POST /api/cron/ml-devolucao-varredura — rede de segurança diária pra devolução do
 * Mercado Livre. Achado real 2026-11-10: a detecção em tempo real (webhook `claims` →
 * `detectarDevolucaoMl`) só enxerga reclamações com `status=opened` — uma devolução que o
 * ML já FECHOU com decisão a favor do comprador (`resolution.reason: "item_returned"`), mas
 * ainda tem ação obrigatória pendente pro vendedor (prazo real tipo `return_review_ok`),
 * passa batido. E o webhook em si pode simplesmente nunca chegar (confirmado: 9 devoluções
 * reais em 2 sellers nunca notificadas, 3 delas já pagas pro fornecedor antes de alguém
 * notar manualmente). Essa rotina varre TODO seller com integração ML ativa 1x/dia, sem
 * depender de webhook nenhum (ver `varrerDevolucoesMlTodosSellers`). Agendamento: Supabase
 * pg_cron diário (web/scripts/add-ml-devolucao-varredura-cron.sql).
 */
import { NextResponse } from "next/server";
import { varrerDevolucoesMlTodosSellers } from "@/lib/mlDevolucaoDeteccao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_ml_devolucao_varredura_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_ml_devolucao_varredura_lock") || lockErr.code === "42883") {
      console.warn("[cron/ml-devolucao-varredura] lock RPC ausente — rode add-ml-devolucao-varredura-cron.sql");
    } else {
      console.error("[cron/ml-devolucao-varredura] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "varredura_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await varrerDevolucoesMlTodosSellers();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/ml-devolucao-varredura]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado na varredura de devolução ML." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_ml_devolucao_varredura_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
