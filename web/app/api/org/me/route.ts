import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, error: "Configuração Supabase ausente (URL ou ANON)." },
      { status: 500 }
    );
  }
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Configuração SUPABASE_SERVICE_ROLE_KEY ausente." },
      { status: 500 }
    );
  }

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return NextResponse.json({ ok: false, error: "Sem token (Authorization)." }, { status: 401 });
    }

    const sb = createClient(url, anon, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ ok: false, error: "Token inválido ou expirado." }, { status: 401 });
    }

    const user = userData.user;

    const sbAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: member, error: mErr } = await sbAdmin
      .from("org_members")
      .select("org_id, role_base, pode_ver_dinheiro")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (mErr) {
      return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
    }

    if (!member?.org_id) {
      return NextResponse.json({ ok: true, user_id: user.id, org_id: null, role_base: null }, { status: 200 });
    }

    const { data: org } = await sbAdmin
      .from("orgs")
      .select("plano")
      .eq("id", member.org_id)
      .maybeSingle();

    const roleBase = member.role_base ?? null;
    return NextResponse.json(
      {
        ok: true,
        user_id: user.id,
        org_id: member.org_id,
        role_base: roleBase,
        pode_ver_dinheiro: member.pode_ver_dinheiro,
        plano: org?.plano ?? "starter",
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    console.error("GET /api/org/me:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
