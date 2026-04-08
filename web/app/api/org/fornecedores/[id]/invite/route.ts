/**
 * POST /api/org/fornecedores/[id]/invite
 * Gera token de convite para o fornecedor criar login.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { resolveInvitePublicOrigin } from "@/lib/appOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id: fornecedor_id } = await params;

    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select("id, nome")
      .eq("id", fornecedor_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (fornErr || !forn) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const { data: existente } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .limit(1)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { error: "Este fornecedor já possui login ativo." },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from("fornecedor_invites")
      .update({ usado: true })
      .eq("fornecedor_id", fornecedor_id)
      .eq("usado", false);

    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("fornecedor_invites")
      .insert({ org_id, fornecedor_id })
      .select("token, expira_em")
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: inviteErr?.message ?? "Erro ao gerar convite." }, { status: 500 });
    }

    const baseUrl = resolveInvitePublicOrigin(req);
    const link = `${baseUrl}/fornecedor/register/${invite.token}`;

    return NextResponse.json({
      ok: true,
      fornecedor_nome: forn.nome,
      link,
      expira_em: invite.expira_em,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
