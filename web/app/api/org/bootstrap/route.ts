import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserIdFromBearerOrCookies } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Faltou SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromBearerOrCookies(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = supabaseService();

    const { data: existing, error: exErr } = await admin
      .from("org_members")
      .select("org_id, role_base")
      .eq("user_id", userId)
      .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    if (existing?.org_id) {
      return NextResponse.json({
        ok: true,
        org_id: existing.org_id,
        role_base: existing.role_base,
      });
    }

    const { data: org, error: orgErr } = await admin
      .from("orgs")
      .insert({ name: "Org do Stark" })
      .select("id")
      .single();

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

    const { error: memErr } = await admin.from("org_members").insert({
      org_id: org.id,
      user_id: userId,
      role_base: "owner",
      pode_ver_dinheiro: true,
    });

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, org_id: org.id, role_base: "owner" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
