/**
 * GET /api/fornecedor/disputas — casos de disputa detectados pela Amanda onde esse
 * fornecedor está envolvido, pra ele poder responder antes do admin decidir.
 *
 * Resposta é enxuta de propósito: só o que a tela de fato usa (pedido, data, status
 * simplificado, a própria resposta, resultado final em frase pronta). Não devolve
 * `evidencia` (motivo/tipo interno do ML) nem `decisao_admin` bruto — informação interna
 * demais pra esse papel, mesmo sendo um caso que já pertence a ele. Nunca mostra dado de
 * outro fornecedor.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CasoRow = {
  id: string;
  ml_order_id: string | null;
  ml_item_id: string | null;
  status: "aberto" | "aguardando_fornecedor" | "decidido";
  fornecedor_resposta: string | null;
  fornecedor_respondeu_em: string | null;
  decisao_admin: "reverter_repasse" | "manter_repasse" | "sem_acao" | null;
  criado_em: string;
};

function resumoStatus(row: CasoRow): string {
  if (row.status !== "decidido") return "Em análise";
  if (row.decisao_admin === "reverter_repasse") return "Encerrado — valor ajustado";
  return "Encerrado — sem pendência";
}

export async function GET(req: Request) {
  const ctx = await getFornecedorContextFromBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: casosRaw, error } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .select("id, ml_order_id, ml_item_id, status, fornecedor_resposta, fornecedor_respondeu_em, decisao_admin, criado_em")
    .eq("fornecedor_id", ctx.fornecedor_id)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const casos = ((casosRaw ?? []) as CasoRow[]).map((c) => ({
    id: c.id,
    ml_order_id: c.ml_order_id,
    ml_item_id: c.ml_item_id,
    criado_em: c.criado_em,
    pode_responder: c.status !== "decidido",
    fornecedor_resposta: c.fornecedor_resposta,
    fornecedor_respondeu_em: c.fornecedor_respondeu_em,
    resumo_status: resumoStatus(c),
  }));

  return NextResponse.json({ ok: true, casos });
}
