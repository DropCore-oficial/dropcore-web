/**
 * POST /api/seller/invite/[token]/link
 * Vincula uma conta Supabase Auth já existente ao seller do convite (seller.user_id ainda nulo).
 * Requer Bearer do utilizador; body opcional { email } deve coincidir com o e-mail da sessão.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addPortalTrialIso } from "@/lib/portalTrial";
import { resolveSellerInvite } from "@/lib/sellerInviteToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const auth = req.headers.get("authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!bearer) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(bearer);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const user_id = userData.user.id;
    const sessionEmail = (userData.user.email ?? "").trim().toLowerCase();

    const body = await req.json().catch(() => ({}));
    const emailBody = body?.email != null ? String(body.email).trim().toLowerCase() : "";
    if (emailBody && emailBody !== sessionEmail) {
      return NextResponse.json(
        { error: "O e-mail enviado não coincide com o da conta em que entrou." },
        { status: 400 }
      );
    }

    const { error: invErr, invite } = await resolveSellerInvite(token);
    if (invErr || !invite) {
      return NextResponse.json({ error: invErr }, { status: 400 });
    }

    const { data: seller, error: sellerFetchErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, user_id, status, nome")
      .eq("id", invite.seller_id)
      .eq("org_id", invite.org_id)
      .maybeSingle();

    if (sellerFetchErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado para este convite." }, { status: 404 });
    }
    if (seller.status === "bloqueado") {
      return NextResponse.json({ error: "Conta bloqueada. Entre em contato com o suporte." }, { status: 403 });
    }

    if (seller.user_id) {
      if (String(seller.user_id) === user_id) {
        await supabaseAdmin.from("seller_invites").update({ usado: true }).eq("id", invite.id).eq("usado", false);
        return NextResponse.json({ ok: true, already_linked: true });
      }
      return NextResponse.json(
        { error: "Este seller já está vinculado a outra conta." },
        { status: 409 }
      );
    }

    const { data: outro } = await supabaseAdmin
      .from("sellers")
      .select("id, nome")
      .eq("user_id", user_id)
      .neq("id", invite.seller_id)
      .maybeSingle();

    if (outro) {
      return NextResponse.json(
        { error: "Sua conta já está vinculada a outro seller. Use outro e-mail ou peça suporte à organização." },
        { status: 409 }
      );
    }

    const { error: upErr } = await supabaseAdmin
      .from("sellers")
      .update({ user_id, atualizado_em: new Date().toISOString() })
      .eq("id", invite.seller_id)
      .eq("org_id", invite.org_id)
      .is("user_id", null);

    if (upErr) {
      return NextResponse.json({ error: "Erro ao vincular conta: " + upErr.message }, { status: 500 });
    }

    const { data: trialRow } = await supabaseAdmin
      .from("sellers")
      .select("trial_valido_ate")
      .eq("id", invite.seller_id)
      .maybeSingle();
    if (!(trialRow as { trial_valido_ate?: string | null } | null)?.trial_valido_ate) {
      await supabaseAdmin
        .from("sellers")
        .update({ trial_valido_ate: addPortalTrialIso() })
        .eq("id", invite.seller_id);
    }

    await supabaseAdmin.from("seller_invites").update({ usado: true }).eq("id", invite.id);

    return NextResponse.json({ ok: true, message: "Conta vinculada ao seller com sucesso." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
