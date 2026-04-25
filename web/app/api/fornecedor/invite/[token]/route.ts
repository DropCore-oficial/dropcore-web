/**
 * GET  /api/fornecedor/invite/[token] — valida token e retorna nome do fornecedor
 * POST /api/fornecedor/invite/[token] — fornecedor define email + senha, cria conta e vínculo
 *   Body POST: { email: string, senha: string }
 *
 * Se o e-mail já existir no Auth, tenta login com a senha informada; em caso de sucesso,
 * vincula o usuário ao fornecedor (convite prova intenção).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { addPortalTrialIso } from "@/lib/portalTrial";

function isEmailAlreadyRegisteredError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("already") ||
    m.includes("registered") ||
    m.includes("exists") ||
    m.includes("duplicate") ||
    m.includes("já foi regist") ||
    m.includes("already been registered")
  );
}

/** Confirma que a senha pertence ao e-mail (cliente anon, sem persistir sessão). */
async function verifyExistingUserPassword(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false as const, error: "Configuração do servidor incompleta." };
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return {
      ok: false as const,
      error:
        "Este e-mail já tem conta. Confirme a senha ou use «Esqueci a senha» no login do fornecedor.",
    };
  }
  await client.auth.signOut();
  return { ok: true as const, userId: data.user.id };
}

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

    let user_id: string | undefined;

    if (authErr || !authData?.user) {
      const msg = authErr?.message ?? "Erro ao criar conta.";
      if (isEmailAlreadyRegisteredError(msg)) {
        const verified = await verifyExistingUserPassword(email, senha);
        if (!verified.ok) {
          return NextResponse.json({ error: verified.error }, { status: 400 });
        }
        user_id = verified.userId;
      } else {
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else {
      user_id = authData.user.id;
    }

    const { data: memExistente } = await supabaseAdmin
      .from("org_members")
      .select("id, fornecedor_id, seller_id")
      .eq("user_id", user_id!)
      .eq("org_id", invite.org_id)
      .maybeSingle();

    if (memExistente?.fornecedor_id === invite.fornecedor_id) {
      await supabaseAdmin.from("fornecedor_invites").update({ usado: true }).eq("id", invite.id);
      return NextResponse.json({
        ok: true,
        message: "Esta conta já está vinculada a este fornecedor. Pode fazer login.",
        already_linked: true,
      });
    }

    if (memExistente?.fornecedor_id && memExistente.fornecedor_id !== invite.fornecedor_id) {
      if (authData?.user) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json(
        {
          error:
            "Este e-mail já está vinculado a outro fornecedor nesta organização. Use outro e-mail ou fale com o suporte.",
        },
        { status: 400 }
      );
    }

    if (memExistente?.seller_id) {
      if (authData?.user) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json(
        {
          error:
            "Este e-mail já está vinculado a um seller nesta organização. Use outro e-mail ou fale com o suporte.",
        },
        { status: 400 }
      );
    }

    if (memExistente?.id && !memExistente.fornecedor_id) {
      const { error: upErr } = await supabaseAdmin
        .from("org_members")
        .update({ fornecedor_id: invite.fornecedor_id, role_base: "admin" })
        .eq("id", memExistente.id);
      if (upErr) {
        if (authData?.user) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        }
        return NextResponse.json(
          { error: "Erro ao vincular conta ao fornecedor: " + upErr.message },
          { status: 500 }
        );
      }
    } else if (!memExistente) {
      const { error: memErr } = await supabaseAdmin.from("org_members").insert({
        user_id: user_id!,
        org_id: invite.org_id,
        role_base: "admin",
        fornecedor_id: invite.fornecedor_id,
      });

      if (memErr) {
        if (authData?.user) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        }
        return NextResponse.json(
          { error: "Erro ao vincular conta ao fornecedor: " + memErr.message },
          { status: 500 }
        );
      }
    }

    const { data: trialForn } = await supabaseAdmin
      .from("fornecedores")
      .select("trial_valido_ate")
      .eq("id", invite.fornecedor_id)
      .maybeSingle();
    if (!(trialForn as { trial_valido_ate?: string | null } | null)?.trial_valido_ate) {
      await supabaseAdmin
        .from("fornecedores")
        .update({ trial_valido_ate: addPortalTrialIso() })
        .eq("id", invite.fornecedor_id);
    }

    await supabaseAdmin
      .from("fornecedor_invites")
      .update({ usado: true })
      .eq("id", invite.id);

    return NextResponse.json({
      ok: true,
      message: "Conta criada com sucesso. Você já pode fazer login.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
