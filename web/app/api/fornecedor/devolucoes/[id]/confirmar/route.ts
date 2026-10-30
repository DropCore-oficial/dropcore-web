/**
 * POST /api/fornecedor/devolucoes/[id]/confirmar — fornecedor confirma que recebeu a
 * devolução "tudo certo". Libera o valor pro saldo do seller na hora (RPC atômica
 * fn_devolucao_fornecedor_confirmar, que reconfere dono + status antes de mexer em dinheiro).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

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

  return NextResponse.json({ ok: true, mensagem: "Devolução confirmada. Valor liberado pro saldo do seller." });
}
