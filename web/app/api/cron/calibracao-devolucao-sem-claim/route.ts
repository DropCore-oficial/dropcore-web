/**
 * GET/POST /api/cron/calibracao-devolucao-sem-claim — só observa, não decide nada.
 * Agendamento: Supabase pg_cron 1x/dia
 * (web/scripts/add-calibracao-devolucao-sem-claim-cron.sql).
 */
import { NextResponse } from "next/server";
import { processarCalibracaoDevolucaoSemClaim } from "@/lib/devolucaoSemClaimCalibracao";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_calibracao_devolucao_sem_claim_lock");
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_calibracao_devolucao_sem_claim_lock") || lockErr.code === "42883") {
      console.warn("[cron/calibracao-devolucao-sem-claim] lock RPC ausente — rode add-calibracao-devolucao-sem-claim-cron.sql");
    } else {
      console.error("[cron/calibracao-devolucao-sem-claim] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const resultado = await processarCalibracaoDevolucaoSemClaim();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    console.error("[cron/calibracao-devolucao-sem-claim]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado na calibração." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_calibracao_devolucao_sem_claim_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
