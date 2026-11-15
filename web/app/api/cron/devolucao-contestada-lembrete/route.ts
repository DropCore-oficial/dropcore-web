/**
 * GET/POST /api/cron/devolucao-contestada-lembrete — lembrete diário pro admin de devolução
 * contestada pelo fornecedor ainda sem decisão (48h+ parada). Ver
 * web/lib/devolucaoContestadaLembrete.ts. Agendamento:
 * web/scripts/add-devolucao-contestada-lembrete-cron.sql.
 */
import { NextResponse } from "next/server";
import { lembrarDevolucoesContestadasPendentes } from "@/lib/devolucaoContestadaLembrete";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc("dropcore_try_devolucao_contestada_lembrete_lock");
  if (lockErr) {
    console.error("[cron/devolucao-contestada-lembrete] lock:", lockErr.message);
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "lembrete_anterior_ainda_em_andamento" });
  }

  try {
    const resultado = await lembrarDevolucoesContestadasPendentes();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    console.error("[cron/devolucao-contestada-lembrete]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado no lembrete de contestação." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_devolucao_contestada_lembrete_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
