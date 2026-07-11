/**
 * GET /api/org/dashboard-pro
 * Analytics avançados — só para plano Pro.
 * Retorna: margem média, ticket médio, top sellers, top fornecedores, vendas por dia.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { loadOrgDashboardPro30d } from "@/lib/orgDashboardProLegacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);

    if (String(plano ?? "starter").toLowerCase() !== "pro") {
      return NextResponse.json({ error: "Recurso exclusivo do Plano Pro.", code: "PRO_ONLY" }, { status: 403 });
    }

    const payload = await loadOrgDashboardPro30d(org_id);

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
