/**
 * GET/POST /api/cron/fornecedor-olist-sync-estoque — pull de estoque Olist → DropCore (todos os fornecedores conectados).
 */
import { NextResponse } from "next/server";
import { runFornecedorOlistEstoquePullTodos } from "@/lib/fornecedorOlistSyncEstoquePull";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  return (req.headers.get("x-cron-secret")?.trim() ?? "") === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const result = await runFornecedorOlistEstoquePullTodos();
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    console.error("[cron/fornecedor-olist-sync-estoque]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro no sync de estoque fornecedor." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
