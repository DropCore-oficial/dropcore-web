import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const skus: string[] = Array.isArray(body?.skus) ? body.skus : [];

    const clean = skus.map((s: string) => String(s || "").trim().toUpperCase()).filter(Boolean);
    if (!clean.length) return NextResponse.json({ error: "skus obrigatório" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("skus")
      .update({ status: "inativo" })
      .in("sku", clean)
      .eq("org_id", org_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: clean.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao inativar";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
