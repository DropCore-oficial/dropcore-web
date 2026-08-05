/**
 * POST /api/org/mensalidades/[id]/pagar
 * Marca mensalidade como paga.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { processarMensalidadePaga } from "@/lib/mensalidadePixProcessor";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Mensalidade não encontrada." }, { status: 404 });
    }
    if (row.status === "pago") {
      return NextResponse.json({ error: "Mensalidade já está paga." }, { status: 400 });
    }

    const ok = await processarMensalidadePaga(id);
    if (!ok) {
      return NextResponse.json({ error: "Não foi possível marcar como paga." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "mensalidade.marcar_pago_manual",
      targetTable: "financial_mensalidades",
      targetId: id,
      detalhes: { status_anterior: row.status },
    });

    return NextResponse.json({ ok: true, status: "pago" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
