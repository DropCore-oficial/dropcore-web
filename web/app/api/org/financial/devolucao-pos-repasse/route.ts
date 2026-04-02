/**
 * POST /api/org/financial/devolucao-pos-repasse
 * Registra devolução após o repasse: insere em financial_debito_descontar.
 * O valor será descontado no próximo repasse (fornecedor + DropCore).
 * Body: { ledger_id: string, ciclo_a_descontar?: "YYYY-MM-DD" } (ciclo = segunda-feira; default = próxima segunda).
 * Ledger deve estar PAGO e ter fornecedor_id.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function proximaSegunda(): string {
  const d = new Date();
  const dia = d.getDay();
  const diff = dia === 0 ? 1 : dia === 1 ? 7 : 8 - dia;
  const seg = new Date(d);
  seg.setDate(seg.getDate() + diff);
  return seg.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const ledger_id = body?.ledger_id != null ? String(body.ledger_id).trim() : null;
    let ciclo_a_descontar: string | null =
      body?.ciclo_a_descontar != null ? String(body.ciclo_a_descontar).trim().slice(0, 10) : null;

    if (!ledger_id) {
      return NextResponse.json({ error: "ledger_id é obrigatório." }, { status: 400 });
    }

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, org_id, seller_id, fornecedor_id, tipo, status, valor_fornecedor, valor_dropcore, valor_total, pedido_id, ciclo_repasse")
      .eq("id", ledger_id)
      .eq("org_id", org_id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Registro do ledger não encontrado." }, { status: 404 });
    }

    if (row.status !== "PAGO") {
      return NextResponse.json(
        { error: "Só é possível registrar devolução pós-repasse para registros já com status PAGO." },
        { status: 400 }
      );
    }

    if (row.tipo !== "BLOQUEIO" && row.tipo !== "VENDA") {
      return NextResponse.json({ error: "Tipo de registro não permite devolução pós-repasse." }, { status: 400 });
    }

    if (!row.fornecedor_id) {
      return NextResponse.json(
        { error: "Registro sem fornecedor associado; não é possível gerar débito a descontar." },
        { status: 400 }
      );
    }

    const { data: jaExiste } = await supabaseAdmin
      .from("financial_debito_descontar")
      .select("id")
      .eq("ledger_id", ledger_id)
      .limit(1)
      .maybeSingle();

    if (jaExiste) {
      return NextResponse.json(
        { error: "Já existe um débito a descontar registrado para este ledger. Não é possível duplicar." },
        { status: 400 }
      );
    }

    if (!ciclo_a_descontar) {
      ciclo_a_descontar = proximaSegunda();
    } else {
      const d = new Date(ciclo_a_descontar);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "ciclo_a_descontar deve ser uma data válida (YYYY-MM-DD)." }, { status: 400 });
      }
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("financial_debito_descontar")
      .insert({
        org_id,
        fornecedor_id: row.fornecedor_id,
        ledger_id,
        valor_fornecedor: row.valor_fornecedor,
        valor_dropcore: row.valor_dropcore,
        valor_total: row.valor_total,
        ciclo_a_descontar,
        descontado: false,
      })
      .select("id, ciclo_a_descontar")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Criar lançamento DEVOLUCAO para o seller ver no extrato e receber o crédito
    if (row.seller_id) {
      const { error: devErr } = await supabaseAdmin
        .from("financial_ledger")
        .insert({
          org_id,
          seller_id: row.seller_id,
          fornecedor_id: row.fornecedor_id ?? null,
          pedido_id: row.pedido_id ?? null,
          tipo: "DEVOLUCAO",
          valor_fornecedor: Number(row.valor_fornecedor),
          valor_dropcore: Number(row.valor_dropcore),
          valor_total: Number(row.valor_total),
          status: "DEVOLVIDO",
          ciclo_repasse: row.ciclo_repasse ?? null,
          referencia: `devolução pós-repasse (ledger ${ledger_id})`,
        });
      if (devErr) {
        console.error("[devolucao-pos-repasse] Erro ao criar DEVOLUCAO:", devErr.message);
      }
    }

    return NextResponse.json({
      ok: true,
      id: inserted?.id,
      ciclo_a_descontar,
      mensagem: `Débito registrado. Será descontado no repasse do ciclo ${ciclo_a_descontar}. Valor devolvido ao seller.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
