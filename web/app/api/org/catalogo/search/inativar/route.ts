import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env (URL ou SERVICE_ROLE).");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Faltou id." }, { status: 400 });

    const supabase = supabaseService();

    const { error } = await supabase
      .from("skus")
      .update({ status: "inativo" })
      .eq("id", id)
      .eq("org_id", org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = orgErrorHttpStatus(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
