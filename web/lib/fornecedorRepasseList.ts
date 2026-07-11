import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type FornecedorRepasseItem = {
  id: string;
  ciclo_repasse: string;
  valor_total: number;
  status: string;
  pago_em: string | null;
  atualizado_em: string | null;
};

export type FornecedorRepasseFuturo = { ciclo_repasse: string; valor_previsto: number; pedidos: number };

export type FornecedorRepasseList = {
  items: FornecedorRepasseItem[];
  total_a_receber: number;
  futuros: FornecedorRepasseFuturo[];
};

type LedgerPreviewRow = { ciclo_repasse: string | null; valor_fornecedor: number | null };

/** Repasses do fornecedor (financial_repasse_fornecedor) + preview de futuros vindo do ledger. */
export async function loadFornecedorRepasseList(
  orgId: string,
  fornecedorId: string,
  opts: { statuses?: string[]; includePreview?: boolean } = {}
): Promise<FornecedorRepasseList> {
  const statuses = opts.statuses?.length ? opts.statuses : ["pendente", "liberado", "pago"];

  const { data: rows, error } = await supabaseAdmin
    .from("financial_repasse_fornecedor")
    .select("id, fornecedor_id, ciclo_repasse, valor_total, status, pago_em, atualizado_em")
    .eq("org_id", orgId)
    .eq("fornecedor_id", fornecedorId)
    .in("status", statuses)
    .order("ciclo_repasse", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const items: FornecedorRepasseItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    ciclo_repasse: r.ciclo_repasse,
    valor_total: Number(r.valor_total),
    status: r.status,
    pago_em: r.pago_em,
    atualizado_em: r.atualizado_em,
  }));

  const total_a_receber = items
    .filter((i) => i.status === "pendente" || i.status === "liberado")
    .reduce((s, i) => s + i.valor_total, 0);

  let futuros: FornecedorRepasseFuturo[] = [];
  if (opts.includePreview) {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = String(hoje.getMonth() + 1).padStart(2, "0");
    const d = String(hoje.getDate()).padStart(2, "0");
    const hojeStr = `${y}-${m}-${d}`;

    const { data: prevRows, error: prevErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("ciclo_repasse, valor_fornecedor")
      .eq("org_id", orgId)
      .eq("fornecedor_id", fornecedorId)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"])
      .gte("ciclo_repasse", hojeStr)
      .order("ciclo_repasse", { ascending: true })
      .limit(500);

    if (prevErr) throw new Error(prevErr.message);

    const byCycle: Record<string, { valor: number; pedidos: number }> = {};
    for (const r of (prevRows ?? []) as LedgerPreviewRow[]) {
      const ciclo = r.ciclo_repasse;
      if (!ciclo) continue;
      if (!byCycle[ciclo]) byCycle[ciclo] = { valor: 0, pedidos: 0 };
      byCycle[ciclo].valor += Number(r.valor_fornecedor ?? 0);
      byCycle[ciclo].pedidos += 1;
    }

    futuros = Object.keys(byCycle)
      .sort((a, b) => (a < b ? -1 : 1))
      .map((ciclo) => ({
        ciclo_repasse: ciclo,
        valor_previsto: Math.max(0, byCycle[ciclo].valor),
        pedidos: byCycle[ciclo].pedidos,
      }))
      .filter((x) => x.valor_previsto > 0)
      .slice(0, 8);
  }

  return { items, total_a_receber, futuros };
}
