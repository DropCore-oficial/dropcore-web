/**
 * GET /api/fornecedor/repasse-detalhe?ciclo_repasse=YYYY-MM-DD — extrato pedido a pedido de
 * um ciclo já pago: vendas que compuseram o valor + débitos de devolução descontados, cada
 * um com o pedido original. Via RPC (fn_fornecedor_repasse_detalhe), regra 9 do CLAUDE.md.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cicloRepasse = searchParams.get("ciclo_repasse");
  if (!cicloRepasse) {
    return NextResponse.json({ error: "ciclo_repasse é obrigatório." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("fn_fornecedor_repasse_detalhe", {
    p_org_id: ctx.org_id,
    p_fornecedor_id: ctx.fornecedor_id,
    p_ciclo_repasse: cicloRepasse,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, itens: data ?? [] });
}
