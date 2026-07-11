import { fetchCalculadoraRecebimentosTotais } from "@/lib/orgDashboardRpc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type CalculadoraRecebimentosWidget = {
  soma_total_geral: number;
  quantidade_total: number;
  ultimos: { id: string; email: string | null; valor: number; pago_em: string }[];
  avisoTabela: string | null;
};

/** Versão "widget" (poucos itens, sem lookup de e-mail) do histórico de PIX da calculadora. */
export async function loadCalculadoraRecebimentosWidget(
  supabase: SupabaseClient,
  limit: number
): Promise<CalculadoraRecebimentosWidget> {
  const { data: rows, error } = await supabase
    .from("calculadora_recebimentos")
    .select("id, valor, pago_em")
    .order("pago_em", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message ?? "")) {
      return {
        soma_total_geral: 0,
        quantidade_total: 0,
        ultimos: [],
        avisoTabela:
          "Tabela calculadora_recebimentos não existe. Execute web/scripts/create-calculadora-recebimentos.sql no Supabase.",
      };
    }
    throw new Error(error.message);
  }

  let quantidade_total = 0;
  let soma_total_geral = 0;
  const totaisRpc = await fetchCalculadoraRecebimentosTotais().catch(() => null);
  if (totaisRpc) {
    quantidade_total = totaisRpc.quantidade_total;
    soma_total_geral = totaisRpc.soma_total_geral;
  } else {
    const { count } = await supabase.from("calculadora_recebimentos").select("*", { count: "exact", head: true });
    quantidade_total = count ?? 0;
    const { data: todasLinhasValor } = await supabase.from("calculadora_recebimentos").select("valor");
    soma_total_geral = (todasLinhasValor ?? []).reduce(
      (acc: number, r: { valor: unknown }) => acc + (Number.isFinite(Number(r.valor)) ? Number(r.valor) : 0),
      0
    );
  }

  const ultimos = (rows ?? []).map((r: { id: string; valor: unknown; pago_em: string }) => ({
    id: r.id,
    email: null,
    valor: Number(r.valor ?? 0),
    pago_em: r.pago_em,
  }));

  return { soma_total_geral, quantidade_total, ultimos, avisoTabela: null };
}
