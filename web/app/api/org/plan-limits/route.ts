/**
 * GET /api/org/plan-limits
 * Retorna limites do plano Starter da org (vendas/mês, produto+cor) ou null se Pro.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIXO_OCULTO = "DJU999";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const supabase = supabaseService();

    const { data: org } = await supabase.from("orgs").select("plano").eq("id", org_id).maybeSingle();
    const plano = org?.plano ?? "starter";
    const isStarter = String(plano ?? "").toLowerCase() !== "pro";

    if (!isStarter) {
      return NextResponse.json({ plan_limits: null });
    }

    const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [vendasMesRes, produtoCorRes] = await Promise.all([
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org_id)
        .gte("criado_em", primeiroDiaMes)
        .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido"),
      supabase
        .from("skus")
        .select("nome_produto, cor")
        .eq("org_id", org_id)
        .ilike("status", "ativo")
        .not("sku", "ilike", `${PREFIXO_OCULTO}%`),
    ]);

    const vendas_mes = vendasMesRes.count ?? 0;

    const produtoCorData = Array.isArray(produtoCorRes.data)
      ? (produtoCorRes.data as Array<{ nome_produto?: string | null; cor?: string | null }>)
      : [];
    const produto_cor_count = new Set(
      produtoCorData.map((r) => `${String(r.nome_produto ?? "").trim()}::${String(r.cor ?? "").trim()}`)
    ).size;

    return NextResponse.json({
      plan_limits: {
        vendas_mes,
        vendas_limite: 200,
        produto_cor_count,
        produto_cor_limite: 15,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
