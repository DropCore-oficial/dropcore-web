/**
 * POST /api/org/gestores-ia/disputas/[id]/decidir — admin registra a decisão final de um
 * caso detectado pela Amanda. NÃO mexe em financial_ledger aqui — se a decisão for
 * "reverter_repasse", o admin ainda precisa usar o fluxo de devolução já existente
 * (/admin/devolucoes) pra executar de verdade; esse endpoint só registra o rastro/decisão
 * (e o `ledger_id`, se informado, é só referência de qual registro foi usado lá).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISOES_VALIDAS = new Set(["reverter_repasse", "manter_repasse", "sem_acao"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as { decisao_admin?: string; decisao_detalhes?: string };
    const decisaoAdmin = body.decisao_admin?.trim();
    const decisaoDetalhes = body.decisao_detalhes?.trim() || null;
    if (!decisaoAdmin || !DECISOES_VALIDAS.has(decisaoAdmin)) {
      return NextResponse.json({ error: "decisao_admin deve ser reverter_repasse, manter_repasse ou sem_acao." }, { status: 400 });
    }

    const { data: caso, error: fetchErr } = await supabaseAdmin
      .from("seller_ai_disputas_fornecedor")
      .select("id, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (fetchErr || !caso) {
      return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("seller_ai_disputas_fornecedor")
      .update({
        status: "decidido",
        decisao_admin: decisaoAdmin,
        decisao_detalhes: decisaoDetalhes,
        decidido_por: user_id,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", org_id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "disputa_fornecedor.decidir",
      targetTable: "seller_ai_disputas_fornecedor",
      targetId: id,
      detalhes: { decisao_admin: decisaoAdmin, decisao_detalhes: decisaoDetalhes, status_anterior: caso.status },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
