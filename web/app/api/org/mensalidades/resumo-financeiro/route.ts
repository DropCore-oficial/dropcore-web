/**
 * GET /api/org/mensalidades/resumo-financeiro?ciclo=YYYY-MM
 * Resumo real por ciclo: contagens de sellers/fornecedores e valores do mês.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { fetchMensalidadeTotaisFinanceirosOrg } from "@/lib/mensalidadeTotaisFinanceirosOrg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const ciclo = searchParams.get("ciclo");

    const resumo = await fetchMensalidadeTotaisFinanceirosOrg(supabaseAdmin, org_id, ciclo);
    return NextResponse.json(resumo);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
