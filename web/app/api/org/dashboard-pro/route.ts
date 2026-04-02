/**
 * GET /api/org/dashboard-pro
 * Analytics avançados — só para plano Pro.
 * Retorna: margem média, ticket médio, top sellers, top fornecedores, vendas por dia.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);

    if (String(plano ?? "starter").toLowerCase() !== "pro") {
      return NextResponse.json({ error: "Recurso exclusivo do Plano Pro.", code: "PRO_ONLY" }, { status: 403 });
    }

    // Últimos 30 dias
    const now = new Date();
    const d30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const d30Iso = d30.toISOString();

    const [pedidosRes, ledgerRes] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("id, seller_id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total, status, criado_em")
        .eq("org_id", org_id)
        .gte("criado_em", d30Iso)
        .order("criado_em", { ascending: true }),
      supabaseAdmin
        .from("financial_ledger")
        .select("valor_fornecedor, valor_dropcore, valor_total, status, data_evento")
        .eq("org_id", org_id)
        .in("tipo", ["BLOQUEIO", "VENDA"])
        .gte("data_evento", d30Iso),
    ]);

    const pedidos = pedidosRes.data ?? [];
    const ledger = ledgerRes.data ?? [];

    const pedidosValidos = pedidos.filter((p) => p.status !== "cancelado" && p.status !== "erro_saldo");
    const totalPedidos = pedidosValidos.length;
    const somaTotal = pedidosValidos.reduce((s, p) => s + Number(p.valor_total || 0), 0);
    const somaDropcore = pedidosValidos.reduce((s, p) => s + Number(p.valor_dropcore || 0), 0);
    const somaFornecedor = pedidosValidos.reduce((s, p) => s + Number(p.valor_fornecedor || 0), 0);

    const ticketMedio = totalPedidos > 0 ? somaTotal / totalPedidos : 0;
    const margemMedia = somaTotal > 0 ? (somaDropcore / somaTotal) * 100 : 0;

    // Top 5 sellers (por volume)
    const sellerAgg: Record<string, { total: number; count: number }> = {};
    for (const p of pedidosValidos) {
      if (!sellerAgg[p.seller_id]) sellerAgg[p.seller_id] = { total: 0, count: 0 };
      sellerAgg[p.seller_id].total += Number(p.valor_total || 0);
      sellerAgg[p.seller_id].count++;
    }
    const sellerIds = Object.keys(sellerAgg);
    let sellerNomes: Record<string, string> = {};
    if (sellerIds.length > 0) {
      const { data } = await supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds);
      for (const s of data ?? []) sellerNomes[s.id] = s.nome;
    }
    const topSellers = Object.entries(sellerAgg)
      .map(([id, v]) => ({ id, nome: sellerNomes[id] ?? "—", total: v.total, pedidos: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Top 5 fornecedores (por volume)
    const fornAgg: Record<string, { total: number; dropcore: number; count: number }> = {};
    for (const p of pedidosValidos) {
      if (!fornAgg[p.fornecedor_id]) fornAgg[p.fornecedor_id] = { total: 0, dropcore: 0, count: 0 };
      fornAgg[p.fornecedor_id].total += Number(p.valor_total || 0);
      fornAgg[p.fornecedor_id].dropcore += Number(p.valor_dropcore || 0);
      fornAgg[p.fornecedor_id].count++;
    }
    const fornIds = Object.keys(fornAgg);
    let fornNomes: Record<string, string> = {};
    if (fornIds.length > 0) {
      const { data } = await supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornIds);
      for (const f of data ?? []) fornNomes[f.id] = f.nome;
    }
    const topFornecedores = Object.entries(fornAgg)
      .map(([id, v]) => ({ id, nome: fornNomes[id] ?? "—", total: v.total, dropcore: v.dropcore, pedidos: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Vendas por dia (últimos 30 dias)
    const porDia: Record<string, { total: number; dropcore: number; count: number }> = {};
    for (const p of pedidosValidos) {
      const dia = String(p.criado_em).slice(0, 10);
      if (!porDia[dia]) porDia[dia] = { total: 0, dropcore: 0, count: 0 };
      porDia[dia].total += Number(p.valor_total || 0);
      porDia[dia].dropcore += Number(p.valor_dropcore || 0);
      porDia[dia].count++;
    }
    const vendasPorDia = Object.entries(porDia)
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    // Ledger: receita PAGO vs pendente
    const ledgerPago = ledger.filter((l) => l.status === "PAGO");
    const ledgerPendente = ledger.filter((l) => l.status !== "PAGO" && l.status !== "CANCELADO" && l.status !== "DEVOLVIDO");
    const receitaPago = ledgerPago.reduce((s, l) => s + Number(l.valor_dropcore || 0), 0);
    const receitaPendente = ledgerPendente.reduce((s, l) => s + Number(l.valor_dropcore || 0), 0);

    return NextResponse.json({
      periodo: "30d",
      total_pedidos: totalPedidos,
      volume_total: somaTotal,
      volume_fornecedor: somaFornecedor,
      volume_dropcore: somaDropcore,
      ticket_medio: Math.round(ticketMedio * 100) / 100,
      margem_media_pct: Math.round(margemMedia * 100) / 100,
      receita_pago: receitaPago,
      receita_pendente: receitaPendente,
      top_sellers: topSellers,
      top_fornecedores: topFornecedores,
      vendas_por_dia: vendasPorDia,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
