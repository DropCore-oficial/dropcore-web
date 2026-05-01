import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { OrgAuthError, requireOrgStaffForOrgId } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const org_id = (searchParams.get("org_id") || "").trim();
    const q = (searchParams.get("q") || "").trim();

    if (!org_id) {
      return NextResponse.json({ error: "Faltou org_id" }, { status: 400 });
    }

    await requireOrgStaffForOrgId(req, org_id);

    let query = supabaseAdmin
      .from("skus")
      .select("*")
      .eq("org_id", org_id)
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(
        [
          `sku.ilike.%${q}%`,
          `produto.ilike.%${q}%`,
          `cor.ilike.%${q}%`,
          `tamanho.ilike.%${q}%`,
          `sku_pai.ilike.%${q}%`,
        ].join(",")
      );
    }

    const { data, error } = await query.limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, items: data || [] });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
