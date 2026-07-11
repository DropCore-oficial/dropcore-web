import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { DashboardProPayload } from "@/lib/orgDashboardRpc";
import { fetchOrgDashboardPro30d } from "@/lib/orgDashboardRpc";

/** Fallback se fn_org_dashboard_pro_30d ainda não foi aplicada no Supabase. */
async function dashboardProLegacy(org_id: string): Promise<DashboardProPayload> {
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

  // Só pedidos que passaram pelo fluxo real de venda (débito de estoque + bloqueio de saldo).
  // "pendente_estoque" e "bloqueado" nunca chegaram lá — não são venda, contá-los infla as métricas.
  const STATUS_VENDA_REAL = new Set(["enviado", "aguardando_repasse", "entregue", "devolvido"]);
  const pedidosValidos = pedidos.filter((p) => STATUS_VENDA_REAL.has(p.status));
  const totalPedidos = pedidosValidos.length;
  const somaTotal = pedidosValidos.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  const somaDropcore = pedidosValidos.reduce((s, p) => s + Number(p.valor_dropcore || 0), 0);
  const somaFornecedor = pedidosValidos.reduce((s, p) => s + Number(p.valor_fornecedor || 0), 0);

  const ticketMedio = totalPedidos > 0 ? somaTotal / totalPedidos : 0;
  const margemMedia = somaTotal > 0 ? (somaDropcore / somaTotal) * 100 : 0;

  const sellerAgg: Record<string, { total: number; count: number }> = {};
  for (const p of pedidosValidos) {
    if (!sellerAgg[p.seller_id]) sellerAgg[p.seller_id] = { total: 0, count: 0 };
    sellerAgg[p.seller_id].total += Number(p.valor_total || 0);
    sellerAgg[p.seller_id].count++;
  }
  const sellerIds = Object.keys(sellerAgg);
  const sellerNomes: Record<string, string> = {};
  if (sellerIds.length > 0) {
    const { data } = await supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds);
    for (const s of data ?? []) sellerNomes[s.id] = s.nome;
  }
  const topSellers = Object.entries(sellerAgg)
    .map(([id, v]) => ({ id, nome: sellerNomes[id] ?? "—", total: v.total, pedidos: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const fornAgg: Record<string, { total: number; dropcore: number; count: number }> = {};
  for (const p of pedidosValidos) {
    if (!fornAgg[p.fornecedor_id]) fornAgg[p.fornecedor_id] = { total: 0, dropcore: 0, count: 0 };
    fornAgg[p.fornecedor_id].total += Number(p.valor_total || 0);
    fornAgg[p.fornecedor_id].dropcore += Number(p.valor_dropcore || 0);
    fornAgg[p.fornecedor_id].count++;
  }
  const fornIds = Object.keys(fornAgg);
  const fornNomes: Record<string, string> = {};
  if (fornIds.length > 0) {
    const { data } = await supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornIds);
    for (const f of data ?? []) fornNomes[f.id] = f.nome;
  }
  const topFornecedores = Object.entries(fornAgg)
    .map(([id, v]) => ({ id, nome: fornNomes[id] ?? "—", total: v.total, dropcore: v.dropcore, pedidos: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

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

  const ledgerPago = ledger.filter((l) => l.status === "PAGO");
  const ledgerPendente = ledger.filter((l) => l.status !== "PAGO" && l.status !== "CANCELADO" && l.status !== "DEVOLVIDO");
  const receitaPago = ledgerPago.reduce((s, l) => s + Number(l.valor_dropcore || 0), 0);
  const receitaPendente = ledgerPendente.reduce((s, l) => s + Number(l.valor_dropcore || 0), 0);

  return {
    periodo: "30d" as const,
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
  };
}

/** Analytics avançados (30d): RPC no Postgres, ou fallback calculado em TS. */
export async function loadOrgDashboardPro30d(org_id: string): Promise<DashboardProPayload> {
  const fromRpc = await fetchOrgDashboardPro30d(org_id).catch(() => null);
  return fromRpc ?? (await dashboardProLegacy(org_id));
}
