/**
 * GET/POST /api/cron/creditos-expiracao
 * Expira lotes de crédito vencidos (ver SELLER_CREDITO_MESES_VALIDADE) e envia avisos 30/7 dias antes.
 * Agendamento: Supabase pg_cron (web/scripts/supabase-cron-jobs.sql), não Vercel Cron.
 */
import { NextResponse } from "next/server";
import { processarCreditosSellerCron } from "@/lib/sellerCreditLots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const cronHeader = req.headers.get("x-vercel-cron")?.trim();
  if (cronHeader === "1" && auth === `Bearer ${secret}`) return true;

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
    const result = await processarCreditosSellerCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
