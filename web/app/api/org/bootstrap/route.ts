import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error("Faltou SUPABASE env (URL/ANON).");
  return createClient(url, key, { auth: { persistSession: false } });
}

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Faltou SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const anon = supabaseAnon();
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = data.user;
    const admin = supabaseService();

    // já tem org?
    const { data: existing, error: exErr } = await admin
      .from("org_members")
      .select("org_id, role_base")
      .eq("user_id", user.id)
      .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    if (existing?.org_id) {
      return NextResponse.json({
        ok: true,
        org_id: existing.org_id,
        role_base: existing.role_base,
      });
    }

    // cria org
    const { data: org, error: orgErr } = await admin
      .from("orgs")
      .insert({ name: "Org do Stark" })
      .select("id")
      .single();

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

    // cria owner
    const { error: memErr } = await admin.from("org_members").insert({
      org_id: org.id,
      user_id: user.id,
      role_base: "owner",
      pode_ver_dinheiro: true,
    });

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, org_id: org.id, role_base: "owner" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 });
  }
}
