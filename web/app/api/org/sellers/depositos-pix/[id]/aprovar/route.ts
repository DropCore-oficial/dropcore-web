/**
 * POST /api/org/sellers/depositos-pix/[id]/aprovar
 * Aprova o depósito PIX manualmente (admin confirmou visualmente que o valor entrou).
 *
 * Usa o mesmo claim atômico (`UPDATE ... WHERE status = 'pendente'`) do webhook do
 * Mercado Pago via `processarDepositoAprovado` — sem isso, um clique manual bem na hora
 * em que o webhook/polling automático também aprova o mesmo depósito credita 2×.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { logAdminAction } from "@/lib/adminAuditLog";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: deposito, error: fetchErr } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, org_id, seller_id, valor, status")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !deposito) {
      return NextResponse.json({ error: "Depósito não encontrado." }, { status: 404 });
    }
    if (deposito.status !== "pendente") {
      return NextResponse.json({ error: "Este depósito já foi aprovado ou cancelado." }, { status: 400 });
    }

    const ok = await processarDepositoAprovado(`deposito-${id}`);
    if (!ok) {
      return NextResponse.json(
        {
          error:
            "Não foi possível aprovar — provavelmente o Mercado Pago já processou este depósito automaticamente nesse meio tempo. Atualize a lista.",
        },
        { status: 409 }
      );
    }

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "deposito_pix.aprovar",
      targetTable: "seller_depositos_pix",
      targetId: id,
      detalhes: { seller_id: deposito.seller_id, valor: Number(deposito.valor) },
    });

    const { data: updated } = await supabaseAdmin.from("sellers").select("saldo_atual").eq("id", deposito.seller_id).single();
    return NextResponse.json({
      ok: true,
      saldo_atual: updated?.saldo_atual != null ? Number(updated.saldo_atual) : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
