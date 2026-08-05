/**
 * GET /api/org/auditoria — Lista admin_audit_log da org (owner/admin), com filtro por
 * ator (e-mail), ação e período.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const actor = searchParams.get("actor")?.trim();
    const action = searchParams.get("action")?.trim();
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();

    let query = supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_email, ip_address, action, target_table, target_id, detalhes, criado_em")
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(300);

    if (actor) query = query.ilike("actor_email", `%${actor}%`);
    if (action) query = query.eq("action", action);
    if (from) query = query.gte("criado_em", `${from}T00:00:00`);
    if (to) query = query.lte("criado_em", `${to}T23:59:59`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
