/**
 * DELETE /api/org/mensalidades/[id] — Remove mensalidade pendente (erro de geração ou teste).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) {
      return NextResponse.json({ error: "Mensalidade não encontrada." }, { status: 404 });
    }
    if (!["pendente", "inadimplente"].includes(row.status)) {
      return NextResponse.json(
        { error: "Só é possível excluir mensalidades ainda não pagas (pendente ou inadimplente)." },
        { status: 400 }
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from("financial_mensalidades")
      .delete()
      .eq("id", id)
      .eq("org_id", org_id);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
