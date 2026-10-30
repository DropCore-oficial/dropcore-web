/**
 * GET /api/fornecedor/devolucoes — devoluções (financial_ledger EM_DEVOLUCAO) aguardando
 * confirmação desse fornecedor, com o prazo de 48h calculado a partir de `em_devolucao_desde`.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRAZO_HORAS = 48;

type LedgerRow = {
  id: string;
  valor_total: number;
  data_evento: string;
  em_devolucao_desde: string | null;
  fornecedor_contestou_em: string | null;
  fornecedor_contestacao_texto: string | null;
};

export async function GET(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("financial_ledger")
    .select("id, valor_total, data_evento, em_devolucao_desde, fornecedor_contestou_em, fornecedor_contestacao_texto")
    .eq("fornecedor_id", ctx.fornecedor_id)
    .eq("status", "EM_DEVOLUCAO")
    .order("em_devolucao_desde", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const devolucoes = ((rows ?? []) as LedgerRow[]).map((r) => {
    const prazoFinal = r.em_devolucao_desde
      ? new Date(new Date(r.em_devolucao_desde).getTime() + PRAZO_HORAS * 60 * 60 * 1000).toISOString()
      : null;
    return {
      id: r.id,
      valor_total: Number(r.valor_total),
      data_evento: r.data_evento,
      prazo_final: prazoFinal,
      contestado: Boolean(r.fornecedor_contestou_em),
      fornecedor_contestacao_texto: r.fornecedor_contestacao_texto,
    };
  });

  return NextResponse.json({ ok: true, devolucoes });
}
