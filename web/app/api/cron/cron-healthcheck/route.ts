/**
 * GET/POST /api/cron/cron-healthcheck — confere se todo cron que deveria estar agendado
 * (CRONS_ESPERADOS em lib/cronHealthCheck.ts) realmente existe em cron.job, rodou
 * recentemente e com sucesso. Avisa owner/admin (notificação interna) se achar problema.
 * Existe pra evitar repetir o que aconteceu com gestores-ia-sync-sku-ml (12 dias sem
 * rodar) e mensalidades-mp-sync (nunca chegou a ser aplicado) sem ninguém perceber.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checarSaudeCrons } from "@/lib/cronHealthCheck";
import { notificarProblemasCron } from "@/lib/cronHealthNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const problemas = await checarSaudeCrons(supabaseAdmin);
    await notificarProblemasCron(supabaseAdmin, problemas);
    return NextResponse.json({ ok: true, problemas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
