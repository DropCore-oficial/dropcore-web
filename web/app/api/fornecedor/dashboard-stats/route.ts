/**
 * GET /api/fornecedor/dashboard-stats
 * Estatísticas para a visão geral do dashboard do fornecedor (somente leitura).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchFornecedorDashboardStats } from "@/lib/fornecedorDashboardRpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIXO_OCULTO = "DJU999";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

async function legacyStats(
  org_id: string,
  fornecedor_id: string,
  startOfMonth: Date,
  endOfMonth: Date
) {
  const startIso = startOfMonth.toISOString();
  const endIso = endOfMonth.toISOString();

  const [
    { count: pedidosAguardando },
    { data: pedidosMes },
    { count: produtosAtivos },
    { data: skusEstoque },
    { data: repasses },
  ] = await Promise.all([
    supabaseAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .eq("status", "enviado"),
    supabaseAdmin
      .from("pedidos")
      .select("valor_fornecedor")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .in("status", ["enviado", "aguardando_repasse", "entregue"])
      .gte("criado_em", startIso)
      .lte("criado_em", endIso),
    supabaseAdmin
      .from("skus")
      .select("id", { count: "exact", head: true })
      .eq("fornecedor_id", fornecedor_id)
      .eq("status", "ativo"),
    supabaseAdmin
      .from("skus")
      .select("id, estoque_atual, estoque_minimo")
      .eq("fornecedor_id", fornecedor_id)
      .not("sku", "ilike", `${PREFIXO_OCULTO}%`)
      .limit(2000),
    supabaseAdmin
      .from("financial_repasse_fornecedor")
      .select("valor_total")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .in("status", ["pendente", "liberado"]),
  ]);

  const estoqueBaixo = (skusEstoque ?? []).filter((r) => {
    const atual = r.estoque_atual;
    const min = r.estoque_minimo;
    return min != null && atual != null && Number(atual) < Number(min);
  }).length;

  return {
    pedidos_aguardando_postagem: pedidosAguardando ?? 0,
    pedidos_mes_count: pedidosMes?.length ?? 0,
    pedidos_mes_valor: (pedidosMes ?? []).reduce((s, p) => s + Number(p.valor_fornecedor ?? 0), 0),
    produtos_ativos: produtosAtivos ?? 0,
    estoque_baixo: estoqueBaixo,
    total_a_receber: (repasses ?? []).reduce((s, r) => s + Number(r.valor_total ?? 0), 0),
  };
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const rpc = await fetchFornecedorDashboardStats(
      ctx.org_id,
      ctx.fornecedor_id,
      startOfMonth.toISOString(),
      endOfMonth.toISOString()
    ).catch(() => null);

    const stats =
      rpc ??
      (await legacyStats(ctx.org_id, ctx.fornecedor_id, startOfMonth, endOfMonth));

    return NextResponse.json(stats);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
