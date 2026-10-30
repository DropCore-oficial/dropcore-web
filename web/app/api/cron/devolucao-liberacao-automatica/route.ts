/**
 * GET/POST /api/cron/devolucao-liberacao-automatica — libera sozinho o valor de devoluções
 * paradas há mais de 48h sem o fornecedor confirmar nem contestar. Agendamento: Supabase
 * pg_cron de hora em hora (web/scripts/add-financial-ledger-devolucao-prazo-fornecedor.sql).
 */
import { NextResponse } from "next/server";
import { processarDevolucaoLiberacaoAutomaticaCron } from "@/lib/devolucaoLiberacaoAutomatica";
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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_devolucao_liberacao_automatica_lock");
  if (lockErr) {
    console.error("[cron/devolucao-liberacao-automatica] lock:", lockErr.message);
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "run_anterior_ainda_em_andamento" });
  }

  try {
    const result = await processarDevolucaoLiberacaoAutomaticaCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[cron/devolucao-liberacao-automatica]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_devolucao_liberacao_automatica_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
