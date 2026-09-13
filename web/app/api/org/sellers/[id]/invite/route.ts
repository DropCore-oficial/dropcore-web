/**
 * POST /api/org/sellers/[id]/invite
 * Gera (ou regenera) um token de convite para o seller criar login.
 * Retorna o link completo para você enviar ao seller.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { resolveInvitePublicOrigin } from "@/lib/appOrigin";
import { clampPortalTrialDiasConvite } from "@/lib/portalTrial";
import { applyPortalTrialFromInviteForSeller } from "@/lib/applyPortalTrialFromInvite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id: seller_id } = await params;
    const body = await req.json().catch(() => ({}));
    const portal_trial_dias = clampPortalTrialDiasConvite(body?.portal_trial_dias);

    // Confirma que o seller pertence à org
    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, nome, user_id")
      .eq("id", seller_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    if (seller.user_id) {
      return NextResponse.json(
        { error: "Este seller já possui login ativo. Não é necessário novo convite." },
        { status: 400 }
      );
    }

    // Invalida convites anteriores não usados para este seller
    await supabaseAdmin
      .from("seller_invites")
      .update({ usado: true })
      .eq("seller_id", seller_id)
      .eq("usado", false);

    // Gera novo convite
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("seller_invites")
      .insert({ org_id, seller_id, portal_trial_dias })
      .select("token, expira_em, portal_trial_dias")
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: inviteErr?.message ?? "Erro ao gerar convite." }, { status: 500 });
    }

    // Trial vale desde a criação do convite — não espera o aceite (senão, sem aceite, nunca é aplicado).
    await applyPortalTrialFromInviteForSeller(supabaseAdmin, seller_id, portal_trial_dias);
    // Reativa status caso um convite anterior tenha expirado sem aceite.
    await supabaseAdmin.from("sellers").update({ status: "ativo" }).eq("id", seller_id);

    const baseUrl = resolveInvitePublicOrigin(req);
    const link = `${baseUrl}/seller/register/${invite.token}`;

    return NextResponse.json({
      ok: true,
      seller_nome: seller.nome,
      link,
      expira_em: invite.expira_em,
      portal_trial_dias: (invite as { portal_trial_dias?: number }).portal_trial_dias ?? portal_trial_dias,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
