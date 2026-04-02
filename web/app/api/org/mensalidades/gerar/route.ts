/**
 * POST /api/org/mensalidades/gerar
 * Gera mensalidades para o mês. Body: { ciclo: "YYYY-MM" }
 * Cria uma linha por seller ativo e por fornecedor ativo.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALOR_DEFAULT_SELLER = 97.9;
const VALOR_DEFAULT_FORNECEDOR = 97.9;

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const cicloStr = body?.ciclo?.trim().slice(0, 7);
    if (!cicloStr || !/^\d{4}-\d{2}$/.test(cicloStr)) {
      return NextResponse.json({ error: "ciclo (YYYY-MM) é obrigatório." }, { status: 400 });
    }
    const primeiroDia = cicloStr + "-01";
    const vencimento = new Date(cicloStr + "-10"); // vencimento dia 10

    const { data: planos } = await supabaseAdmin.from("financial_planos").select("plano, valor_seller, valor_fornecedor");
    const planosMap = new Map((planos ?? []).map((p) => [p.plano, p]));

    const [sellersRes, fornRes] = await Promise.all([
      supabaseAdmin.from("sellers").select("id, nome, plano").eq("org_id", org_id).ilike("status", "ativo"),
      supabaseAdmin.from("fornecedores").select("id, nome").eq("org_id", org_id).ilike("status", "ativo"),
    ]);

    const sellers = sellersRes.data ?? [];
    const fornecedores = fornRes.data ?? [];
    const rows: { org_id: string; tipo: string; entidade_id: string; ciclo: string; valor: number; vencimento_em: string }[] = [];

    for (const s of sellers) {
      const p = (s.plano?.trim() || "").toLowerCase();
      const planoKey = p === "pro" ? "Pro" : p === "starter" ? "Starter" : "default";
      const pc = planosMap.get(planoKey) ?? planosMap.get("default");
      const valor = pc ? Number(pc.valor_seller) : VALOR_DEFAULT_SELLER;
      rows.push({
        org_id,
        tipo: "seller",
        entidade_id: s.id,
        ciclo: primeiroDia,
        valor,
        vencimento_em: vencimento.toISOString().slice(0, 10),
      });
    }
    for (const f of fornecedores) {
      const pc = planosMap.get("default");
      const valor = pc ? Number(pc.valor_fornecedor) : VALOR_DEFAULT_FORNECEDOR;
      rows.push({
        org_id,
        tipo: "fornecedor",
        entidade_id: f.id,
        ciclo: primeiroDia,
        valor,
        vencimento_em: vencimento.toISOString().slice(0, 10),
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        ciclo: primeiroDia,
        geradas: 0,
        message: "Nenhum seller ou fornecedor ativo para gerar mensalidades.",
      });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("financial_mensalidades")
      .upsert(rows, { onConflict: "tipo,entidade_id,ciclo", ignoreDuplicates: false })
      .select("id");

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json(
          { error: "Tabela financial_mensalidades não existe. Execute create-mensalidades.sql." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ciclo: primeiroDia,
      geradas: inserted?.length ?? rows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
