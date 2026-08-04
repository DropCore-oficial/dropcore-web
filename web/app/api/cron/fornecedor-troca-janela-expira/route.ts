/**
 * GET/POST /api/cron/fornecedor-troca-janela-expira
 * Tranca de novo, sozinho, o seller que ficou livre pra trocar de fornecedor (prazo mínimo
 * natural vencido OU liberação antecipada do admin) e não agiu em DIAS_JANELA_ESCOLHA_FORNECEDOR
 * dias — reinicia o compromisso mínimo com o fornecedor atual
 * (ver web/lib/sellerFornecedorTrocaJanelaExpira.ts).
 * Agendamento: Supabase pg_cron (web/scripts/supabase-cron-jobs.sql), não Vercel Cron.
 */
import { NextResponse } from "next/server";
import { processarFornecedorTrocaJanelaExpiraCron } from "@/lib/sellerFornecedorTrocaJanelaExpira";

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
    const resultado = await processarFornecedorTrocaJanelaExpiraCron();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
