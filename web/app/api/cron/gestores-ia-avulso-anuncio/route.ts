/**
 * GET/POST /api/cron/gestores-ia-avulso-anuncio — cron A: submete o diagnóstico diário do
 * Anúncio via Anthropic Batch API (desconto de 50% — mesmo padrão do hub). Até 2026-10-07
 * rodava síncrono (preço cheio) pra todo mundo, inclusive a rodada automática que ninguém
 * está esperando na tela; corrigido pra usar Batch API igual o hub (gestorBatchSubmit.ts),
 * já que o cron pode esperar até 24h pelo resultado sem problema nenhum. Assinante BYOK
 * continua síncrono (chave própria, ver gestorAvulsoBatchSubmit.ts). NÃO grava resultado
 * aqui — cron B (`gestores-ia-avulso-anuncio-resultado`) confere quando o batch termina.
 */
import { NextResponse } from "next/server";
import { submeterAndreyAvulsoDiario } from "@/lib/ai/gestorAvulsoBatchSubmit";

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
    const resultado = await submeterAndreyAvulsoDiario();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro_desconhecido" }, { status: 500 });
  }
}
