/**
 * GET /api/org/cd/remessas-pendentes?orgId=...&fornecedorId=...
 * Fila do operador: remessas declaradas pelo fornecedor ainda sem conferência de entrada.
 */
import { NextResponse } from "next/server";
import { OrgAuthError, orgErrorHttpStatus, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    await requireOrgStaffForOrgId(req, orgId);

    const fornecedorId = searchParams.get("fornecedorId")?.trim() || null;

    const { data, error } = await supabaseAdmin.rpc("fn_cd_remessas_pendentes_lista", {
      p_org_id: orgId,
      p_fornecedor_id: fornecedorId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, remessas: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
