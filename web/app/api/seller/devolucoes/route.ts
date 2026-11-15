/**
 * GET /api/seller/devolucoes — devoluções (financial_ledger EM_DEVOLUCAO) do seller
 * autenticado, só pra mostrar se o fornecedor já contestou (achado real 2026-11-15: o
 * seller não tinha nenhuma visibilidade disso — via só "Em devolução" genérico, mesmo
 * quando o fornecedor já tinha contestado com motivo, enquanto admin e fornecedor já viam
 * isso claramente). Não devolve valor_fornecedor/valor_dropcore — regra de privacidade é
 * sobre o fornecedor não ver o total do seller, mas aqui é o contrário (seller vendo dado
 * do próprio pedido), então não tem problema nenhum em devolver valor_total.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, pedido_id, fornecedor_contestou_em, fornecedor_contestacao_texto, em_devolucao_entrega_confirmada_ml_em")
    .eq("org_id", seller.org_id)
    .eq("seller_id", seller.id)
    .eq("status", "EM_DEVOLUCAO")
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const devolucoes = (data ?? []).map((r) => ({
    id: r.id,
    pedido_id: r.pedido_id,
    contestado: Boolean(r.fornecedor_contestou_em),
    fornecedor_contestacao_texto: r.fornecedor_contestacao_texto,
    entrega_confirmada_em: r.em_devolucao_entrega_confirmada_ml_em,
  }));

  return NextResponse.json({ ok: true, devolucoes });
}
