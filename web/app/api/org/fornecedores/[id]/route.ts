import { NextResponse } from "next/server";
import { deleteFornecedorCascade } from "@/lib/fornecedorDeleteCascade";
import { OrgAuthError, orgErrorHttpStatus, requireAdminForOrgId } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampMensalidadeDiaVencimento } from "@/lib/mensalidadeDiaVencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/org/fornecedores/[id]?orgId=...
 * body: { premium?: boolean, mensalidade_dia_vencimento?: number | null }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    await requireAdminForOrgId(req, orgId);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (typeof body?.premium === "boolean") {
      updates.premium = body.premium;
    }
    if (body?.mensalidade_dia_vencimento !== undefined) {
      if (body.mensalidade_dia_vencimento === null) {
        updates.mensalidade_dia_vencimento = null;
      } else {
        updates.mensalidade_dia_vencimento = clampMensalidadeDiaVencimento(Number(body.mensalidade_dia_vencimento));
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Envie { premium: boolean } e/ou { mensalidade_dia_vencimento: number | null }." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("fornecedores")
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, premium, mensalidade_dia_vencimento")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, ...data });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

/**
 * DELETE /api/org/fornecedores/[id]?orgId=...
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = (searchParams.get("orgId") || "").trim();
    if (!orgId) {
      return NextResponse.json({ error: "orgId é obrigatório" }, { status: 400 });
    }

    await requireAdminForOrgId(req, orgId);

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const result = await deleteFornecedorCascade(supabaseAdmin, orgId, id);
    if (!result.ok) {
      const status = result.message.includes("não encontrado") ? 404 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
