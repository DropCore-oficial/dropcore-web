/**
 * GET /api/org/financial/ledger
 * Lista registros do ledger da org (para bloqueios/devoluções).
 * Query: statuses=BLOQUEADO,ENTREGUE,AGUARDANDO_REPASSE,EM_DEVOLUCAO (opcional; default = esses 4)
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STATUSES = ["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE", "EM_DEVOLUCAO"];

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam
      ? statusesParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_STATUSES;

    const { data: rows, error } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, seller_id, fornecedor_id, tipo, valor_total, status, data_evento, ciclo_repasse, pedido_id")
      .eq("org_id", org_id)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .in("status", statuses.length ? statuses : DEFAULT_STATUSES)
      .order("data_evento", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = Array.isArray(rows) ? rows : [];
    const sellerIds = [...new Set(list.map((r) => r.seller_id).filter(Boolean))] as string[];
    const fornecedorIds = [...new Set(list.map((r) => r.fornecedor_id).filter(Boolean))] as string[];

    const ledgerIds = list.map((r) => r.id);

    const [sellersRes, fornRes, debitosRes] = await Promise.all([
      sellerIds.length
        ? supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds)
        : Promise.resolve({ data: [] }),
      fornecedorIds.length
        ? supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornecedorIds)
        : Promise.resolve({ data: [] }),
      ledgerIds.length
        ? supabaseAdmin.from("financial_debito_descontar").select("ledger_id").in("ledger_id", ledgerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const sellerMap = new Map((sellersRes.data || []).map((s) => [s.id, s.nome]));
    const fornMap = new Map((fornRes.data || []).map((f) => [f.id, f.nome]));
    const debitosSet = new Set((debitosRes.data || []).map((d) => d.ledger_id));

    const items = list.map((r) => ({
      id: r.id,
      seller_id: r.seller_id,
      seller_nome: sellerMap.get(r.seller_id) ?? "—",
      fornecedor_id: r.fornecedor_id,
      fornecedor_nome: r.fornecedor_id ? (fornMap.get(r.fornecedor_id) ?? "—") : "—",
      tipo: r.tipo,
      valor_total: Number(r.valor_total),
      status: r.status,
      data_evento: r.data_evento,
      ciclo_repasse: r.ciclo_repasse,
      pedido_id: r.pedido_id ?? null,
      debito_ja_registrado: debitosSet.has(r.id),
    }));

    return NextResponse.json(items);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
