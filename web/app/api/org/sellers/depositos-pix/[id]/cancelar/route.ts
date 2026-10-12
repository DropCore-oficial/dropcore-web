/**
 * POST /api/org/sellers/depositos-pix/[id]/cancelar
 * Cancela um depósito PIX pendente (nunca chegou / duplicado). Não toca ledger nem crédito.
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
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    // Claim atômico — mesmo padrão de depositoPixProcessor.ts. Sem o `.eq("status", "pendente")`
    // direto no UPDATE, uma aprovação concorrente (webhook/sync do Mercado Pago) entre o
    // SELECT e o UPDATE podia creditar o seller e, logo depois, esse cancelamento sobrescrever
    // o status pra "cancelado" mesmo já tendo sido aprovado de verdade — achado real 2026-10-12.
    const { data: deposito, error: updateErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .update({ status: "cancelado" })
      .eq("id", id)
      .eq("org_id", org_id)
      .eq("status", "pendente")
      .select("id, org_id, seller_id, valor")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    if (!deposito) {
      return NextResponse.json({ error: "Este depósito já foi aprovado ou cancelado." }, { status: 400 });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "deposito_pix.cancelar",
      targetTable: "seller_depositos_pix",
      targetId: id,
      detalhes: { seller_id: deposito.seller_id, valor: Number(deposito.valor) },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
