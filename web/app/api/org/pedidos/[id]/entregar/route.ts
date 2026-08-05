/**
 * PATCH /api/org/pedidos/[id]/entregar
 * Confirma envio do pedido pelo fornecedor:
 * - pedidos.status → "enviado" → "aguardando_repasse"
 * - financial_ledger.status → "AGUARDANDO_REPASSE"
 * - ciclo_repasse é recalculado a partir do momento desta confirmação (postagem),
 *   não reaproveitado do valor gravado na venda.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { promoverPedidoParaPostado } from "@/lib/pedidoPostadoPromote";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id: pedido_id } = await params;

    if (!pedido_id) {
      return NextResponse.json({ error: "ID do pedido é obrigatório." }, { status: 400 });
    }

    // 1) Buscar pedido
    const { data: pedido, error: pedidoErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, status, ledger_id, org_id")
      .eq("id", pedido_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (pedidoErr) return NextResponse.json({ error: pedidoErr.message }, { status: 500 });
    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    if (pedido.status === "aguardando_repasse") {
      return NextResponse.json({ error: "Envio já confirmado para este pedido." }, { status: 409 });
    }
    if (pedido.status !== "enviado") {
      return NextResponse.json(
        { error: `Não é possível confirmar envio de um pedido com status "${pedido.status}".` },
        { status: 422 }
      );
    }

    const promote = await promoverPedidoParaPostado({
      org_id,
      pedido_id,
      ledger_id: pedido.ledger_id,
      evento: {
        tipo: "pedido_postado_manual",
        origem: "manual",
        actor_id: null,
        actor_tipo: "admin",
        descricao: "Envio confirmado manualmente pelo admin.",
        metadata: { via: "admin/pedidos" },
      },
    });

    if (!promote.ok) return NextResponse.json({ error: promote.error }, { status: 500 });

    await logAdminAction({
      req,
      orgId: org_id,
      actorUserId: user_id,
      action: "pedido.confirmar_envio_manual",
      targetTable: "pedidos",
      targetId: pedido_id,
    });

    return NextResponse.json({
      ok: true,
      pedido_id,
      status: "aguardando_repasse",
      ciclo_repasse: promote.ciclo_repasse,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
