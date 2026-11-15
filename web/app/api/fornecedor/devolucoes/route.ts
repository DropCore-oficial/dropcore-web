/**
 * GET /api/fornecedor/devolucoes — devoluções (financial_ledger EM_DEVOLUCAO) aguardando
 * confirmação desse fornecedor. Prazo de 72h só começa a contar quando o Mercado Livre
 * confirma a entrega física da peça (`em_devolucao_entrega_confirmada_ml_em`, gravado por
 * `fn_devolucao_marcar_entrega_confirmada_ml` em lib/mlDevolucaoDeteccao.ts) — achado
 * 2026-11-10: contar a partir de `em_devolucao_desde` (quando o sistema travou o dinheiro)
 * não tem relação com a peça ter chegado de verdade (demora 10+ dias no mundo real).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRAZO_HORAS = 72;

type LedgerRow = {
  id: string;
  valor_fornecedor: number;
  data_evento: string;
  em_devolucao_desde: string | null;
  em_devolucao_entrega_confirmada_ml_em: string | null;
  fornecedor_contestou_em: string | null;
  fornecedor_contestacao_texto: string | null;
};

export async function GET(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Duas fontes: devolução registrada manual pelo admin usa `financial_ledger.fornecedor_id`
  // direto; devolução detectada via ML usa o `fornecedor_id` resolvido pelo catálogo em
  // `seller_ml_devolucoes_detectadas` (pode divergir do ledger — achado real 2026-10-30:
  // seller vende produto de um fornecedor diferente do "oficialmente conectado").
  const [ledgerDireto, deteccoes] = await Promise.all([
    supabaseAdmin
      .from("financial_ledger")
      .select(
        "id, valor_fornecedor, data_evento, em_devolucao_desde, em_devolucao_entrega_confirmada_ml_em, fornecedor_contestou_em, fornecedor_contestacao_texto"
      )
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("status", "EM_DEVOLUCAO")
      .limit(100),
    supabaseAdmin
      .from("seller_ml_devolucoes_detectadas")
      .select("ledger_id")
      .eq("fornecedor_id", ctx.fornecedor_id)
      .not("ledger_id", "is", null),
  ]);

  if (ledgerDireto.error) {
    return NextResponse.json({ error: ledgerDireto.error.message }, { status: 500 });
  }

  const ledgerIdsViaDeteccao = [...new Set((deteccoes.data ?? []).map((d) => d.ledger_id as string))];
  const idsJaTemos = new Set((ledgerDireto.data ?? []).map((r) => r.id));
  const idsFaltando = ledgerIdsViaDeteccao.filter((id) => !idsJaTemos.has(id));

  const { data: ledgerViaDeteccao } = idsFaltando.length
    ? await supabaseAdmin
        .from("financial_ledger")
        .select(
        "id, valor_fornecedor, data_evento, em_devolucao_desde, em_devolucao_entrega_confirmada_ml_em, fornecedor_contestou_em, fornecedor_contestacao_texto"
      )
        .in("id", idsFaltando)
        .eq("status", "EM_DEVOLUCAO")
    : { data: [] as LedgerRow[] };

  const rows = [...(ledgerDireto.data ?? []), ...(ledgerViaDeteccao ?? [])].sort((a, b) =>
    (a.em_devolucao_desde ?? "").localeCompare(b.em_devolucao_desde ?? "")
  );

  const devolucoes = (rows as LedgerRow[]).map((r) => {
    const entregaConfirmadaEm = r.em_devolucao_entrega_confirmada_ml_em;
    const prazoFinal = entregaConfirmadaEm
      ? new Date(new Date(entregaConfirmadaEm).getTime() + PRAZO_HORAS * 60 * 60 * 1000).toISOString()
      : null;
    return {
      id: r.id,
      valor_fornecedor: Number(r.valor_fornecedor),
      data_evento: r.data_evento,
      entrega_confirmada_em: entregaConfirmadaEm,
      prazo_final: prazoFinal,
      contestado: Boolean(r.fornecedor_contestou_em),
      fornecedor_contestacao_texto: r.fornecedor_contestacao_texto,
    };
  });

  return NextResponse.json({ ok: true, devolucoes });
}
