/**
 * POST /api/fornecedor/devolucoes/[id]/confirmar — fornecedor confirma que recebeu a
 * devolução "tudo certo". Libera o valor pro saldo do seller na hora (RPC atômica
 * fn_devolucao_fornecedor_confirmar, que reconfere dono + status antes de mexer em dinheiro).
 * Achado 2026-11-10: esse caminho nunca avisava o seller pelo sino (só a liberação
 * automática de 72h avisava) — ele só saberia olhando o próprio saldo/extrato sozinho.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .rpc("fn_devolucao_fornecedor_confirmar", { p_ledger_id: id, p_fornecedor_id: ctx.fornecedor_id })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = data as { ok: boolean; motivo: string | null } | null;
  if (!resultado?.ok) {
    return NextResponse.json({ error: resultado?.motivo ?? "Não foi possível confirmar." }, { status: 400 });
  }

  const { data: ledgerRow } = await supabaseAdmin
    .from("financial_ledger")
    .select("org_id, seller_id, pedido_id")
    .eq("id", id)
    .maybeSingle();
  if (ledgerRow?.seller_id) {
    await notifySellerPedidoAtencao({
      org_id: ledgerRow.org_id,
      seller_id: ledgerRow.seller_id,
      pedido_id: ledgerRow.pedido_id,
      tipo: "devolucao_confirmada_fornecedor_seller",
      motivo: "O fornecedor confirmou o recebimento da devolução — o valor já foi liberado pro seu saldo.",
    });
  }

  return NextResponse.json({ ok: true, mensagem: "Devolução confirmada. Valor liberado pro saldo do seller." });
}
