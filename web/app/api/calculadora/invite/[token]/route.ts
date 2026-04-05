import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

type InviteRow = {
  id: string;
  token: string;
  email_alvo: string | null;
  validade_dias: number;
  expira_em: string;
  usado: boolean;
};

async function resolveInvite(token: string): Promise<{ invite: InviteRow | null; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("calculadora_invites")
    .select("id, token, email_alvo, validade_dias, expira_em, usado")
    .eq("token", token)
    .maybeSingle<InviteRow>();

  if (error || !data) return { invite: null, error: "Convite não encontrado." };
  if (data.usado) return { invite: null, error: "Este convite já foi utilizado." };
  if (new Date(data.expira_em).getTime() < Date.now()) {
    return { invite: null, error: "Este convite expirou." };
  }
  return { invite: data, error: null };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const { invite, error } = await resolveInvite(token);

    if (!invite || error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      email_alvo: invite.email_alvo,
      validade_dias: invite.validade_dias,
      expira_em: invite.expira_em,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function computeValidoAte(baseISO: string | null, validadeDias: number): string {
  const now = new Date();
  const base = baseISO ? new Date(baseISO) : now;
  const start = base.getTime() > now.getTime() ? base : now;
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + validadeDias);
  return end.toISOString();
}

function isDuplicateUserError(authErr: { message?: string } | null | undefined): boolean {
  const m = (authErr?.message ?? "").toLowerCase();
  return (
    m.includes("already") ||
    m.includes("registered") ||
    m.includes("exists") ||
    m.includes("duplicate") ||
    m.includes("unique")
  );
}

/** Lista páginas até achar e-mail (convite nominativo). Limite de páginas por segurança. */
async function findUserIdByEmail(emailNorm: string): Promise<string | null> {
  const target = emailNorm.toLowerCase();
  let page = 1;
  const perPage = 200;
  const maxPages = 40;

  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers:", error.message);
      return null;
    }
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit?.id) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    const { invite, error: inviteError } = await resolveInvite(token);
    if (!invite || inviteError) {
      return NextResponse.json({ error: inviteError }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    if (senha.length < 6) {
      return NextResponse.json({ error: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }
    if (invite.email_alvo && invite.email_alvo.toLowerCase() !== email) {
      return NextResponse.json(
        { error: `Este convite é válido apenas para ${invite.email_alvo}.` },
        { status: 400 },
      );
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const existing = await sbAnon.auth.signInWithPassword({ email, password: senha });
    let userId: string | null = existing.data.user?.id ?? null;
    let linkedExistingAccount = false;

    if (!userId) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authErr || !authData?.user) {
        const msg = authErr?.message ?? "Erro ao criar conta.";
        const nominativo =
          invite.email_alvo != null && invite.email_alvo.toLowerCase() === email;

        if (isDuplicateUserError(authErr) && nominativo) {
          const existingId = await findUserIdByEmail(email);
          if (!existingId) {
            return NextResponse.json(
              { error: "Conta já existe, mas não foi possível localizar o usuário. Tente /calculadora/login." },
              { status: 500 },
            );
          }
          userId = existingId;
          linkedExistingAccount = true;
        } else if (isDuplicateUserError(authErr)) {
          return NextResponse.json(
            {
              error:
                "Este e-mail já tem conta na DropCore. Entre em /calculadora/login com sua senha. Se esqueceu a senha, use “Esqueci a senha” no login.",
            },
            { status: 400 },
          );
        } else {
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      } else {
        userId = authData.user.id;
      }
    }

    const { data: currentAssin, error: assinReadErr } = await supabaseAdmin
      .from("calculadora_assinantes")
      .select("id, valido_ate, ativo")
      .eq("user_id", userId)
      .maybeSingle<{ id: string; valido_ate: string; ativo: boolean }>();

    if (assinReadErr) {
      return NextResponse.json(
        {
          error:
            "Tabela calculadora_assinantes indisponível. Rode o script create-calculadora-assinantes.sql no Supabase.",
        },
        { status: 503 },
      );
    }

    const novoValidoAte = computeValidoAte(currentAssin?.valido_ate ?? null, invite.validade_dias);

    const { error: upsertErr } = await supabaseAdmin.from("calculadora_assinantes").upsert(
      {
        user_id: userId,
        valido_ate: novoValidoAte,
        ativo: true,
      },
      { onConflict: "user_id" },
    );

    if (upsertErr) {
      return NextResponse.json({ error: "Erro ao ativar assinatura: " + upsertErr.message }, { status: 500 });
    }

    const { error: markErr } = await supabaseAdmin
      .from("calculadora_invites")
      .update({ usado: true, usado_em: new Date().toISOString() })
      .eq("id", invite.id);

    if (markErr) {
      return NextResponse.json(
        { error: "Assinatura criada, mas falhou ao consumir convite: " + markErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: linkedExistingAccount
        ? "Acesso da calculadora atualizado na sua conta. Entre com a senha que você já usa."
        : "Conta criada e assinatura ativada com sucesso.",
      linkedExistingAccount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
