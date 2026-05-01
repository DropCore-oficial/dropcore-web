import { NextResponse } from "next/server";
import {
  OrgAuthError,
  requireAdmin,
  requireAdminForOrgId,
} from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    await requireAdminForOrgId(req, orgId);

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .select(
        "id, nome, org_id, status, premium, sla_postagem_dias, janela_validacao_dias, criado_em, cnpj, telefone, email_comercial"
      )
      .eq("org_id", orgId)
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro no GET /api/org/fornecedores";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/org/fornecedores
 * Body: { nome: string }
 * Cria novo fornecedor na org. Apenas admin/owner.
 */
export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .insert({ org_id, nome, status: "ativo" })
      .select("id, nome, org_id, status, premium, criado_em")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização."
        ? 401
        : msg === "Sem permissão."
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
