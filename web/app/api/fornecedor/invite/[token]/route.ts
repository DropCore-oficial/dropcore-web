/**
 * GET  /api/fornecedor/invite/[token] — valida token e retorna nome do fornecedor
 * POST /api/fornecedor/invite/[token] — fornecedor define email + senha, cria conta e vínculo
 *   Body POST: { email: string, senha: string }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

async function resolveInvite(token: string) {
  const { data, error } = await supabaseAdmin
    .from("fornecedor_invites")
    .select("id, org_id, fornecedor_id, usado, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { error: "Convite não encontrado.", invite: null };
  if (data.usado) return { error: "Este convite já foi utilizado.", invite: null };
  if (new Date(data.expira_em) < new Date()) return { error: "Este convite expirou.", invite: null };
  return { error: null, invite: data };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const { error, invite } = await resolveInvite(token);
    if (error || !invite) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const { data: forn } = await supabaseAdmin
      .from("fornecedores")
      .select("nome")
      .eq("id", invite.fornecedor_id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      fornecedor_nome: forn?.nome ?? "—",
      expira_em: invite.expira_em,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const { error: invErr, invite } = await resolveInvite(token);
    if (invErr || !invite) {
      return NextResponse.json({ error: invErr }, { status: 400 });
    }

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    if (!senha || senha.length < 6) {
      return NextResponse.json({ error: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });

    if (authErr || !authData?.user) {
      const msg = authErr?.message ?? "Erro ao criar conta.";
      if (msg.toLowerCase().includes("already")) {
        return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const user_id = authData.user.id;

    // Insere org_member vinculando usuário ao fornecedor
    const { error: memErr } = await supabaseAdmin.from("org_members").insert({
      user_id,
      org_id: invite.org_id,
      role_base: "admin",
      fornecedor_id: invite.fornecedor_id,
    });

    if (memErr) {
      await supabaseAdmin.auth.admin.deleteUser(user_id);
      return NextResponse.json(
        { error: "Erro ao vincular conta ao fornecedor: " + memErr.message },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("fornecedor_invites")
      .update({ usado: true })
      .eq("id", invite.id);

    return NextResponse.json({ ok: true, message: "Conta criada com sucesso. Você já pode fazer login." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
