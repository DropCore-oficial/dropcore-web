/**
 * POST /api/org/calculadora/assinantes/[userId]/apagar-conta
 * Remove o usuário do Supabase Auth (login). Irreversível.
 * Bloqueado se existir seller ou membership em org (evita dados órfãos).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normEmail(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

export async function POST(req: Request, { params }: Params) {
  try {
    await requireAdmin(req);
    const { userId } = await params;
    if (!userId?.trim()) {
      return NextResponse.json({ error: "userId inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmEmail = normEmail(body?.email ?? "");
    if (!confirmEmail || !confirmEmail.includes("@")) {
      return NextResponse.json(
        { error: "Envie o e-mail de confirmação no corpo: { \"email\": \"...\" }" },
        { status: 400 },
      );
    }

    const supabase = supabaseService();

    const { data: authUser, error: authGetErr } = await supabase.auth.admin.getUserById(userId);
    if (authGetErr || !authUser?.user) {
      return NextResponse.json({ error: "Usuário não encontrado no Auth." }, { status: 404 });
    }

    const authEmail = normEmail(authUser.user.email ?? "");
    if (!authEmail || authEmail !== confirmEmail) {
      return NextResponse.json(
        { error: "O e-mail digitado não coincide com a conta. Confira e tente de novo." },
        { status: 400 },
      );
    }

    const { data: seller } = await supabase.from("sellers").select("id").eq("user_id", userId).maybeSingle();
    if (seller?.id) {
      return NextResponse.json(
        {
          error:
            "Este usuário é seller DropCore. Não pode excluir a conta de login por aqui — faça o offboarding no fluxo de sellers.",
        },
        { status: 403 },
      );
    }

    const { data: member } = await supabase.from("org_members").select("id").eq("user_id", userId).limit(1).maybeSingle();
    if (member?.id) {
      return NextResponse.json(
        {
          error:
            "Este usuário pertence a uma organização (org_members). Remova-o da org antes de excluir a conta de login.",
        },
        { status: 403 },
      );
    }

    await supabase.from("calculadora_assinantes").delete().eq("user_id", userId);

    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
