/**
 * GET/POST /api/cron/segatto-pedido-demo — gera 1 pedido fictício novo pra conta demo
 * Segatto (ver `web/lib/segattoPedidoDemo.ts`), pra ela parecer viva quando mostrada a
 * possíveis sellers. Agendamento: Supabase pg_cron a cada 3h, job
 * `dropcore-segatto-pedido-demo` em web/scripts/supabase-cron-jobs.sql.
 */
import { NextResponse } from "next/server";
import { gerarPedidoDemoSegatto } from "@/lib/segattoPedidoDemo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const resultado = await gerarPedidoDemoSegatto();
  if (!resultado.ok) {
    console.error("[cron/segatto-pedido-demo]", resultado.motivo);
    return NextResponse.json({ ok: false, error: resultado.motivo }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pedido_id: resultado.pedido_id });
}

export async function POST(req: Request) {
  return GET(req);
}
