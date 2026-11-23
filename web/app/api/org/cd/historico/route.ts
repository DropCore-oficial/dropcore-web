/**
 * GET /api/org/cd/historico?orgId=...&fornecedorId=...&page=0&perPage=50
 * Histórico completo do CD (remessa declarada, conferência, baixa manual), paginado.
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_PAGE_DEFAULT = 50;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    await requireOrgStaffForOrgId(req, orgId);

    const fornecedorId = searchParams.get("fornecedorId")?.trim() || null;
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "", 10) || PER_PAGE_DEFAULT));

    const { data, error } = await supabaseAdmin.rpc("fn_cd_movimentos_historico_lista", {
      p_org_id: orgId,
      p_fornecedor_id: fornecedorId,
      p_limit: perPage,
      p_offset: page * perPage,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, movimentos: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
