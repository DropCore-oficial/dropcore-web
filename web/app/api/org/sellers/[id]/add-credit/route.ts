import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org_id } = await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const valor = typeof body?.valor === "number" ? body.valor : parseFloat(String(body?.valor ?? "0").replace(",", "."));
    const motivo = body?.motivo != null ? String(body.motivo).trim() : "Crédito adicionado pelo admin";

    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Valor deve ser um número positivo." }, { status: 400 });
    }
    const MINIMO_CREDITO = 500;
    if (valor < MINIMO_CREDITO) {
      return NextResponse.json({ error: `Valor mínimo para adicionar crédito é R$ ${MINIMO_CREDITO},00.` }, { status: 400 });
    }

    const { data: seller, error: fetchErr } = await supabaseAdmin
      .from("sellers")
      .select("id, saldo_atual")
      .eq("id", id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    // Ledger V2: inserir CREDITO (saldo derivado do ledger; trigger sincroniza sellers)
    const { error: ledgerErr } = await supabaseAdmin.from("financial_ledger").insert({
      org_id: org_id,
      seller_id: id,
      fornecedor_id: null,
      pedido_id: null,
      tipo: "CREDITO",
      valor_fornecedor: 0,
      valor_dropcore: valor,
      valor_total: valor,
      status: "LIBERADO",
      referencia: motivo || "Crédito adicionado",
    });

    if (ledgerErr) {
      return NextResponse.json({ error: ledgerErr.message ?? "Erro ao lançar crédito no ledger." }, { status: 500 });
    }

    const { error: movErr } = await supabaseAdmin.from("seller_movimentacoes").insert({
      seller_id: id,
      tipo: "credito",
      valor,
      motivo: motivo || "Crédito adicionado",
    });

    if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 });

    // Ler saldo atual (do ledger via trigger ou do seller)
    const { data: updated } = await supabaseAdmin
      .from("sellers")
      .select("saldo_atual")
      .eq("id", id)
      .single();
    const saldoAtual = updated?.saldo_atual != null ? Number(updated.saldo_atual) : Number(seller.saldo_atual) + valor;

    return NextResponse.json({ ok: true, saldo_atual: saldoAtual });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
