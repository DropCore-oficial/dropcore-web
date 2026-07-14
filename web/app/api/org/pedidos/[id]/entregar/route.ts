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
import { resolveLedgerIdForPedido } from "@/lib/resolveLedgerForPedido";
import { proximoCicloRepasse } from "@/lib/cicloRepasse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAdmin(req);
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

    // 2) Atualizar status do pedido
    const now = new Date().toISOString();
    const { error: upPedido } = await supabaseAdmin
      .from("pedidos")
      .update({ status: "aguardando_repasse", atualizado_em: now })
      .eq("id", pedido_id)
      .eq("org_id", org_id);

    if (upPedido) return NextResponse.json({ error: upPedido.message }, { status: 500 });

    const ledgerId = await resolveLedgerIdForPedido(org_id, pedido_id, pedido.ledger_id);

    if (ledgerId && !pedido.ledger_id) {
      await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerId, atualizado_em: now }).eq("id", pedido_id);
    }

    // 3) Atualizar ledger vinculado (extrato do seller)
    let ciclo_repasse: string | null = null;

    if (ledgerId) {
      const { data: cicloRow } = await supabaseAdmin.rpc("fn_ciclo_repasse", { data_evento: now });
      ciclo_repasse = cicloRow ?? proximoCicloRepasse();

      const { error: upLedger } = await supabaseAdmin
        .from("financial_ledger")
        .update({
          status: "AGUARDANDO_REPASSE",
          ciclo_repasse,
          atualizado_em: now,
        })
        .eq("id", ledgerId);

      if (upLedger) {
        console.error("[entregar] ledger update:", upLedger.message);
        return NextResponse.json({ error: "Erro ao atualizar ledger: " + upLedger.message }, { status: 500 });
      }
    }

    await supabaseAdmin.from("pedido_eventos").insert({
      org_id,
      pedido_id,
      tipo: "pedido_postado_manual",
      origem: "manual",
      actor_id: null,
      actor_tipo: "admin",
      descricao: "Envio confirmado manualmente pelo admin.",
      metadata: { via: "admin/pedidos" },
    });

    return NextResponse.json({
      ok: true,
      pedido_id,
      status: "aguardando_repasse",
      ciclo_repasse,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
