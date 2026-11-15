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
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { notifyFornecedorDevolucaoNaoProcede } from "@/lib/notifyFornecedorDevolucaoNaoProcede";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user_id, org_id } = await requireAdmin(req);
    const { id } = await params;

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, status, seller_id, fornecedor_id, pedido_id, valor_total, valor_fornecedor")
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

    // Avisa os dois lados — sem isso ninguém sabia que essa decisão tinha acontecido
    // (achado real 2026-11-14: nem seller nem fornecedor eram notificados aqui).
    if (row.seller_id) {
      notifySellerPedidoAtencao({
        org_id,
        seller_id: row.seller_id,
        pedido_id: row.pedido_id,
        tipo: "devolucao_nao_procede_seller",
        motivo: `O admin decidiu que a devolução não procede — a venda foi mantida e os ${formatMoney(Number(row.valor_total))} não voltam pro seu saldo.`,
      }).catch((e) => console.error("[ledger/manter-venda] erro ao notificar seller:", e));
    }
    if (row.fornecedor_id) {
      notifyFornecedorDevolucaoNaoProcede({
        org_id,
        fornecedor_id: row.fornecedor_id,
        ledger_id: id,
        pedido_id: row.pedido_id,
        valor_fornecedor: Number(row.valor_fornecedor),
      }).catch((e) => console.error("[ledger/manter-venda] erro ao notificar fornecedor:", e));
    }

    return NextResponse.json({ ok: true, mensagem: "Devolução revertida. Venda segue o fluxo normal de repasse." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
