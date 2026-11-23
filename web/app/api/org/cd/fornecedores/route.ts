/**
 * GET /api/org/cd/fornecedores?orgId=...
 * Lista mínima (id, nome) dos fornecedores que operam no CD — alimenta os seletores do
 * painel /admin/cd. Separada de /api/org/fornecedores (que é admin-only e traz campo
 * sensível/bancário) pra permitir acesso também ao operador do CD (role operacional).
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

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .select("id, nome")
      .eq("org_id", orgId)
      .eq("opera_no_cd", true)
      .order("nome", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, fornecedores: data ?? [] });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
