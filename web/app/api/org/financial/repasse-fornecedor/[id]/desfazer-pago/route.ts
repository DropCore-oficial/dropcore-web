/**
 * POST /api/org/financial/repasse-fornecedor/[id]/desfazer-pago
 * Desfaz "marcar como pago" por engano (achado real 2026-10-12: não existia nenhuma forma
 * de reverter). Só sai de status pago → pendente; nunca mexe em outro status.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id, user_id: actorId } = await requireAdmin(req);
    const { id } = await params;

    const { data, error } = await supabaseAdmin.rpc("fn_org_repasse_fornecedor_desfazer_pago", {
      p_org_id: org_id,
      p_repasse_id: id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Esse repasse não está marcado como pago (ou já foi desfeito)." },
        { status: 400 }
      );
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: actorId,
      action: "financial_repasse_fornecedor.desfazer_pago",
      targetTable: "financial_repasse_fornecedor",
      targetId: id,
    });

    return NextResponse.json({ ok: true, status: "pendente", mensagem: "Pagamento desfeito. Repasse voltou pra pendente." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
