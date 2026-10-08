/**
 * GET/POST /api/cron/gestores-ia-avulso-andrey-resultado — cron B: confere os batches
 * "pendente" do Andrey avulso e grava o resultado quando a Anthropic terminar de processar
 * (até 24h, por isso roda a cada 15min — mesmo padrão do hub, ver
 * gestorBatchResultado.ts / /api/cron/gestores-ia-resultado).
 */
import { NextResponse } from "next/server";
import { processarAndreyAvulsoBatchesPendentes } from "@/lib/ai/gestorAvulsoBatchResultado";

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
    const resultado = await processarAndreyAvulsoBatchesPendentes();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro_desconhecido" }, { status: 500 });
  }
}
