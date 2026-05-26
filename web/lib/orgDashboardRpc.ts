import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OrgDashboardStatsAgg = {
  saldo_sellers_total: number;
  estoque_baixo: number;
  entrada_mes: number;
  mensalidades_sellers_pendente: number;
  mensalidades_fornecedores_pendente: number;
  produto_cor_count: number;
  min_vencimento_pendente: string | null;
};

export type DashboardProPayload = {
  periodo: string;
  total_pedidos: number;
  volume_total: number;
  volume_fornecedor: number;
  volume_dropcore: number;
  ticket_medio: number;
  margem_media_pct: number;
  receita_pago: number;
  receita_pendente: number;
  top_sellers: Array<{ id: string; nome: string; total: number; pedidos: number }>;
  top_fornecedores: Array<{ id: string; nome: string; total: number; dropcore: number; pedidos: number }>;
  vendas_por_dia: Array<{ dia: string; total: number; dropcore: number; count: number }>;
};

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  return (
    code === "42883" ||
    code === "PGRST202" ||
    msg.includes("fn_org_dashboard") ||
    msg.includes("does not exist")
  );
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchOrgDashboardStatsAgg(
  orgId: string,
  primeiroDiaMes: string,
  ultimoDiaMes: string
): Promise<OrgDashboardStatsAgg | null> {
  const { data, error } = await supabaseAdmin.rpc("fn_org_dashboard_stats_agg", {
    p_org_id: orgId,
    p_primeiro_dia_mes: primeiroDiaMes,
    p_ultimo_dia_mes: ultimoDiaMes,
  });

  if (error) {
    if (isMissingRpcError(error)) return null;
    throw new Error(error.message);
  }

  const row = data as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return null;

  return {
    saldo_sellers_total: num(row.saldo_sellers_total),
    estoque_baixo: num(row.estoque_baixo),
    entrada_mes: num(row.entrada_mes),
    mensalidades_sellers_pendente: num(row.mensalidades_sellers_pendente),
    mensalidades_fornecedores_pendente: num(row.mensalidades_fornecedores_pendente),
    produto_cor_count: num(row.produto_cor_count),
    min_vencimento_pendente:
      typeof row.min_vencimento_pendente === "string" ? row.min_vencimento_pendente : null,
  };
}

export async function fetchOrgDashboardPro30d(orgId: string): Promise<DashboardProPayload | null> {
  const { data, error } = await supabaseAdmin.rpc("fn_org_dashboard_pro_30d", {
    p_org_id: orgId,
  });

  if (error) {
    if (isMissingRpcError(error)) return null;
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  return {
    periodo: String(d.periodo ?? "30d"),
    total_pedidos: num(d.total_pedidos),
    volume_total: num(d.volume_total),
    volume_fornecedor: num(d.volume_fornecedor),
    volume_dropcore: num(d.volume_dropcore),
    ticket_medio: num(d.ticket_medio),
    margem_media_pct: num(d.margem_media_pct),
    receita_pago: num(d.receita_pago),
    receita_pendente: num(d.receita_pendente),
    top_sellers: Array.isArray(d.top_sellers) ? (d.top_sellers as DashboardProPayload["top_sellers"]) : [],
    top_fornecedores: Array.isArray(d.top_fornecedores)
      ? (d.top_fornecedores as DashboardProPayload["top_fornecedores"])
      : [],
    vendas_por_dia: Array.isArray(d.vendas_por_dia)
      ? (d.vendas_por_dia as DashboardProPayload["vendas_por_dia"])
      : [],
  };
}

/** dias até o vencimento mais próximo (null se não houver pendente com data). */
export function diasAteVencimentoFromMin(minVencimento: string | null): number | null {
  if (!minVencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(`${minVencimento}T12:00:00`);
  if (Number.isNaN(v.getTime())) return null;
  return Math.ceil((v.getTime() - hoje.getTime()) / 864e5);
}
