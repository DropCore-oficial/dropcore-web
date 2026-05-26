import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type FornecedorDashboardStats = {
  pedidos_aguardando_postagem: number;
  pedidos_mes_count: number;
  pedidos_mes_valor: number;
  produtos_ativos: number;
  estoque_baixo: number;
  total_a_receber: number;
};

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "");
  return (
    code === "42883" ||
    code === "PGRST202" ||
    msg.includes("fn_fornecedor_dashboard") ||
    msg.includes("does not exist")
  );
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function fetchFornecedorDashboardStats(
  orgId: string,
  fornecedorId: string,
  startOfMonth: string,
  endOfMonth: string
): Promise<FornecedorDashboardStats | null> {
  const { data, error } = await supabaseAdmin.rpc("fn_fornecedor_dashboard_stats", {
    p_org_id: orgId,
    p_fornecedor_id: fornecedorId,
    p_start: startOfMonth,
    p_end: endOfMonth,
  });

  if (error) {
    if (isMissingRpcError(error)) return null;
    throw new Error(error.message);
  }

  const row = data as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return null;

  return {
    pedidos_aguardando_postagem: num(row.pedidos_aguardando_postagem),
    pedidos_mes_count: num(row.pedidos_mes_count),
    pedidos_mes_valor: num(row.pedidos_mes_valor),
    produtos_ativos: num(row.produtos_ativos),
    estoque_baixo: num(row.estoque_baixo),
    total_a_receber: num(row.total_a_receber),
  };
}
