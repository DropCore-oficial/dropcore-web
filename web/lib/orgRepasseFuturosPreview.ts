import type { OrgRepasseFuturosPreview } from "@/lib/orgDashboardRpc";
import { fetchOrgRepasseFuturosPreview } from "@/lib/orgDashboardRpc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const EMPTY: OrgRepasseFuturosPreview = {
  repasse_futuros_previstos_total_valor: 0,
  repasse_futuros_previstos_total_pedidos: 0,
  repasse_futuros_previstos_ciclos_qtd: 0,
  repasse_futuros_proximo_ciclo: null,
  repasse_futuros_proximo_pedidos: 0,
  repasse_futuros_proximo_valor: 0,
};

async function legacyFromLedger(
  supabase: SupabaseClient,
  orgId: string,
  hojeStr: string
): Promise<OrgRepasseFuturosPreview> {
  const { data: prevRows, error: prevErr } = await supabase
    .from("financial_ledger")
    .select("ciclo_repasse, valor_fornecedor")
    .eq("org_id", orgId)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"])
    .gte("ciclo_repasse", hojeStr)
    .order("ciclo_repasse", { ascending: true })
    .limit(2000);

  if (prevErr) throw prevErr;

  const byCycle: Record<string, { valor: number; pedidos: number }> = {};
  for (const r of prevRows ?? []) {
    const ciclo = r.ciclo_repasse as string | null;
    if (!ciclo) continue;
    if (!byCycle[ciclo]) byCycle[ciclo] = { valor: 0, pedidos: 0 };
    byCycle[ciclo].valor += Number(r.valor_fornecedor ?? 0);
    byCycle[ciclo].pedidos += 1;
  }

  const repasse_futuros_previstos = Object.keys(byCycle)
    .sort((a, b) => (a < b ? -1 : 1))
    .map((ciclo) => ({
      ciclo_repasse: ciclo,
      valor_previsto: Math.max(0, byCycle[ciclo].valor),
      pedidos: byCycle[ciclo].pedidos,
    }))
    .filter((x) => x.valor_previsto > 0);

  const top8 = repasse_futuros_previstos.slice(0, 8);
  const proximo = top8[0] ?? null;

  return {
    repasse_futuros_previstos_total_valor: top8.reduce((s, x) => s + Number(x.valor_previsto ?? 0), 0),
    repasse_futuros_previstos_total_pedidos: top8.reduce((s, x) => s + Number(x.pedidos ?? 0), 0),
    repasse_futuros_previstos_ciclos_qtd: top8.length,
    repasse_futuros_proximo_ciclo: proximo?.ciclo_repasse ?? null,
    repasse_futuros_proximo_pedidos: proximo?.pedidos ?? 0,
    repasse_futuros_proximo_valor: proximo?.valor_previsto ?? 0,
  };
}

/** Preview de repasses futuros (RPC no Postgres ou fallback no ledger). */
export async function loadOrgRepasseFuturosPreview(
  supabase: SupabaseClient,
  orgId: string,
  hojeStr: string
): Promise<OrgRepasseFuturosPreview> {
  const rpc = await fetchOrgRepasseFuturosPreview(orgId, hojeStr).catch(() => null);
  if (rpc) return rpc;
  return legacyFromLedger(supabase, orgId, hojeStr);
}

export { EMPTY as emptyRepasseFuturosPreview };
