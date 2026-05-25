/**
 * GET/POST /api/cron/mensalidades-mes
 * Gera mensalidades do mês corrente (America/Sao_Paulo) para todas as orgs com sellers ou fornecedores,
 * marca inadimplentes e reverte linhas indevidas durante trial.
 * Agendamento: Supabase pg_cron (web/scripts/supabase-cron-jobs.sql), não Vercel Cron.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gerarMensalidadesParaOrgCiclo } from "@/lib/gerarMensalidadesCicloOrg";
import { marcarInadimplentes, reverterInadimplentesDuranteTrial } from "@/lib/inadimplencia";
import { cicloMesAtualSaoPaulo } from "@/lib/mensalidadeDiaVencimento";

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
  const [{ data: s }, { data: f }] = await Promise.all([
    supabaseAdmin.from("sellers").select("org_id").not("org_id", "is", null),
    supabaseAdmin.from("fornecedores").select("org_id").not("org_id", "is", null),
  ]);
  const set = new Set<string>();
  for (const r of s ?? []) {
    const id = (r as { org_id?: string }).org_id;
    if (id) set.add(id);
  }
  for (const r of f ?? []) {
    const id = (r as { org_id?: string }).org_id;
    if (id) set.add(id);
  }
  return [...set];
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const ciclo = cicloMesAtualSaoPaulo();
  const orgIds = await distinctOrgIds();
  const detalhes: { org_id: string; ok: boolean; geradas?: number; error?: string }[] = [];

  for (const org_id of orgIds) {
    try {
      await reverterInadimplentesDuranteTrial(supabaseAdmin, org_id);
      await marcarInadimplentes(supabaseAdmin, org_id);
      const g = await gerarMensalidadesParaOrgCiclo(org_id, ciclo);
      if (g.ok) {
        detalhes.push({ org_id, ok: true, geradas: g.geradas });
      } else {
        detalhes.push({ org_id, ok: false, error: g.error });
      }
    } catch (e: unknown) {
      detalhes.push({
        org_id,
        ok: false,
        error: e instanceof Error ? e.message : "Erro",
      });
    }
  }

  const okCount = detalhes.filter((d) => d.ok).length;
  return NextResponse.json({
    ok: true,
    ciclo,
    orgs: orgIds.length,
    geradas_ok: okCount,
    detalhes,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
