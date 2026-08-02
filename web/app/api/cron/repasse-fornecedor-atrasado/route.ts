/**
 * GET/POST /api/cron/repasse-fornecedor-atrasado
 * Notifica admins/owners da org quando existe ciclo de repasse (terça-feira) vencido e ainda
 * não fechado em /admin/repasse-fornecedor.
 * Agendamento: Supabase pg_cron (web/scripts/supabase-cron-jobs.sql), não Vercel Cron.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncRepasseFornecedorAtrasadoNotifications } from "@/lib/repasseFornecedorAtrasadoNotifications";

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

async function distinctOrgIds(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("orgs").select("id");
  return (data ?? []).map((r) => r.id as string).filter(Boolean);
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const orgIds = await distinctOrgIds();
  const erros: { org_id: string; error: string }[] = [];

  for (const org_id of orgIds) {
    try {
      await syncRepasseFornecedorAtrasadoNotifications(org_id);
    } catch (e: unknown) {
      erros.push({ org_id, error: e instanceof Error ? e.message : "Erro" });
    }
  }

  return NextResponse.json({ ok: true, orgs: orgIds.length, erros });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
