/**
 * GET /api/org/financial/repasse-fornecedor-list
 * Lista repasses a pagar aos fornecedores (financial_repasse_fornecedor).
 * Query: status=pendente (default) ou status=pendente,liberado ou vazio para todos.
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status")?.trim() || "pendente";
    const statuses = statusParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    const statusesFiltro = statuses.length ? statuses : ["pendente", "liberado"];

    const { data: rows, error, count } = await supabaseAdmin
      .from("financial_repasse_fornecedor")
      .select("id, fornecedor_id, ciclo_repasse, valor_total, status, atualizado_em", { count: "exact" })
      .eq("org_id", org_id)
      .in("status", statusesFiltro)
      .order("ciclo_repasse", { ascending: false })
      .order("fornecedor_id")
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = Array.isArray(rows) ? rows : [];
    // Achado real 2026-10-12: limite de 200 linhas pra exibição escondia valor pendente real
    // do "total a pagar" quando passava disso — soma sempre vem de uma consulta à parte, sem
    // limite, nunca da lista capada que o admin vê na tela.
    const truncado = (count ?? list.length) > list.length;
    let totalPendenteReal = list
      .filter((i) => i.status === "pendente" || i.status === "liberado")
      .reduce((s, i) => s + Number(i.valor_total), 0);
    if (truncado) {
      const { data: todosValores } = await supabaseAdmin
        .from("financial_repasse_fornecedor")
        .select("valor_total")
        .eq("org_id", org_id)
        .in("status", ["pendente", "liberado"].filter((s) => statusesFiltro.includes(s)));
      totalPendenteReal = (todosValores ?? []).reduce((s, r) => s + Number(r.valor_total), 0);
    }
    const fornecedorIds = [...new Set(list.map((r) => r.fornecedor_id).filter(Boolean))] as string[];

    const fornMap: Record<string, string> = {};
    if (fornecedorIds.length > 0) {
      const { data: fornRows } = await supabaseAdmin
        .from("fornecedores")
        .select("id, nome")
        .in("id", fornecedorIds);
      for (const f of fornRows ?? []) {
        fornMap[f.id] = f.nome ?? "—";
      }
    }

    const items = list.map((r) => ({
      id: r.id,
      fornecedor_id: r.fornecedor_id,
      fornecedor_nome: fornMap[r.fornecedor_id] ?? "—",
      ciclo_repasse: r.ciclo_repasse,
      valor_total: Number(r.valor_total),
      status: r.status,
      atualizado_em: r.atualizado_em,
    }));

    // Receita DropCore por ciclo (informativo — não é um valor a pagar ao fornecedor).
    const ciclosPresentes = [...new Set(items.map((i) => i.ciclo_repasse))];
    let ciclos: { ciclo_repasse: string; total_dropcore: number; total_fornecedores: number }[] = [];
    if (ciclosPresentes.length > 0) {
      const { data: ciclosRows } = await supabaseAdmin
        .from("financial_ciclos_repasse")
        .select("ciclo_repasse, total_dropcore, total_fornecedores")
        .eq("org_id", org_id)
        .in("ciclo_repasse", ciclosPresentes);
      ciclos = (ciclosRows ?? []).map((c) => ({
        ciclo_repasse: c.ciclo_repasse,
        total_dropcore: Number(c.total_dropcore),
        total_fornecedores: Number(c.total_fornecedores),
      }));
    }
    const totalDropcore = ciclos.reduce((s, c) => s + c.total_dropcore, 0);

    return NextResponse.json({
      items,
      total_a_pagar: totalPendenteReal,
      ciclos,
      total_dropcore: totalDropcore,
      truncado,
      total_registros: count ?? list.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
