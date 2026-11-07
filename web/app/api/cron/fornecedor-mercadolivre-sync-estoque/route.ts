/**
 * GET/POST /api/cron/fornecedor-mercadolivre-sync-estoque — pull de estoque Mercado Livre
 * (conta do fornecedor) → DropCore (todos os fornecedores conectados). Espelho de
 * /api/cron/fornecedor-olist-sync-estoque.
 */
import { NextResponse } from "next/server";
import { runFornecedorMercadoLivreEstoquePullTodos } from "@/lib/fornecedorMercadoLivreSyncEstoque";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc(
    "dropcore_try_fornecedor_mercadolivre_estoque_sync_lock",
  );
  if (lockErr) {
    const msg = String(lockErr.message ?? "").toLowerCase();
    if (msg.includes("dropcore_try_fornecedor_mercadolivre_estoque_sync_lock") || lockErr.code === "42883") {
      console.warn("[cron/fornecedor-mercadolivre-sync-estoque] lock RPC ausente — rode add-fornecedor-mercadolivre-estoque-sync-cron.sql");
    } else {
      console.error("[cron/fornecedor-mercadolivre-sync-estoque] lock:", lockErr.message);
    }
  } else if (gotLock === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "sync_anterior_ainda_em_andamento",
    });
  }

  try {
    const result = await runFornecedorMercadoLivreEstoquePullTodos();
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    console.error("[cron/fornecedor-mercadolivre-sync-estoque]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro no sync de estoque fornecedor." },
      { status: 500 },
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_fornecedor_mercadolivre_estoque_sync_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
