/**
 * POST /api/org/financial/ledger/[id]/manter-venda — admin decide que a devolução não
 * procede (fornecedor tinha razão): reverte o ledger pro status de origem, como se a venda
 * nunca tivesse entrado em devolução. Dinheiro volta pro fluxo normal (repasse), não pro
 * saldo do seller. Caminho que faltava — hoje só existia "devolve pro seller".
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();
    if (fetchErr || !row) {
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_devolucao_admin_manter_venda", { p_ledger_id: id }).single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const resultado = data as { ok: boolean; motivo: string | null } | null;
    if (!resultado?.ok) {
      return NextResponse.json({ error: resultado?.motivo ?? "Não foi possível reverter." }, { status: 400 });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "ledger.devolucao_nao_procede",
      targetTable: "financial_ledger",
      targetId: id,
      detalhes: { status_anterior: row.status },
    });

    return NextResponse.json({ ok: true, mensagem: "Devolução revertida. Venda segue o fluxo normal de repasse." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
