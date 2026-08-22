/**
 * Dado real pro gestor "Risco de Ruptura & Fulfillment": estoque dos SKUs habilitados do
 * seller (skus.estoque_atual/estoque_minimo, já sincronizado via Olist/Bling) cruzado com
 * a venda dos últimos 30 dias (pedido_itens, fonte de verdade de item vendido — não
 * pedidos.sku_id, que é campo legado de single-item), dias até ruptura (cálculo puro, não
 * pedido pra IA), pedido pago aguardando estoque, e fornecedor (pra agrupar na tela).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SkuRupturaContexto } from "./gestorPrompts";

const JANELA_VELOCIDADE_DIAS = 30;

type HabilitadoComSku = {
  sku_id: string;
  skus: {
    sku: string;
    nome_produto: string | null;
    estoque_atual: number | null;
    estoque_minimo: number | null;
    fornecedor_id: string | null;
  } | null;
};

type PedidoItemComPedido = {
  sku_id: string;
  quantidade: number | null;
  pedidos: { seller_id: string; status: string; criado_em: string } | null;
};

/** Estoque atual ÷ velocidade diária de venda. null quando não há venda suficiente pra estimar. */
export function calcularDiasAteRuptura(estoqueAtual: number, vendas30d: number): number | null {
  if (vendas30d <= 0) return null;
  const velocidadeDiaria = vendas30d / JANELA_VELOCIDADE_DIAS;
  return Math.floor(estoqueAtual / velocidadeDiaria);
}

export async function buscarDadosRupturaFulfillment(
  sellerId: string
): Promise<SkuRupturaContexto[]> {
  const { data: habilitadosRaw, error: habilitadosErr } = await supabaseAdmin
    .from("seller_skus_habilitados")
    .select("sku_id, skus(sku, nome_produto, estoque_atual, estoque_minimo, fornecedor_id)")
    .eq("seller_id", sellerId);

  if (habilitadosErr) throw new Error(habilitadosErr.message);

  const habilitados = (habilitadosRaw ?? []) as unknown as HabilitadoComSku[];
  if (habilitados.length === 0) return [];

  const skuIds = habilitados.map((h) => h.sku_id);
  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_VELOCIDADE_DIAS);

  const [vendasRes, aguardandoRes, fornecedoresRes] = await Promise.all([
    supabaseAdmin
      .from("pedido_itens")
      .select("sku_id, quantidade, pedidos!inner(seller_id, status, criado_em)")
      .in("sku_id", skuIds)
      .eq("pedidos.seller_id", sellerId)
      .neq("pedidos.status", "cancelado")
      .gte("pedidos.criado_em", desde.toISOString()),
    supabaseAdmin
      .from("pedido_itens")
      .select("sku_id, pedidos!inner(seller_id, status)")
      .in("sku_id", skuIds)
      .eq("pedidos.seller_id", sellerId)
      .eq("pedidos.status", "pendente_estoque"),
    supabaseAdmin
      .from("fornecedores")
      .select("id, nome")
      .in(
        "id",
        Array.from(
          new Set(
            habilitados
              .map((h) => h.skus?.fornecedor_id)
              .filter((id): id is string => !!id)
          )
        )
      ),
  ]);

  if (vendasRes.error) throw new Error(vendasRes.error.message);
  if (aguardandoRes.error) throw new Error(aguardandoRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);

  const itens = (vendasRes.data ?? []) as unknown as PedidoItemComPedido[];
  const vendasPorSku = new Map<string, number>();
  for (const item of itens) {
    const atual = vendasPorSku.get(item.sku_id) ?? 0;
    vendasPorSku.set(item.sku_id, atual + (item.quantidade ?? 0));
  }

  const aguardandoPorSku = new Map<string, number>();
  for (const item of (aguardandoRes.data ?? []) as unknown as { sku_id: string }[]) {
    aguardandoPorSku.set(item.sku_id, (aguardandoPorSku.get(item.sku_id) ?? 0) + 1);
  }

  const fornecedorNomePorId = new Map<string, string>(
    ((fornecedoresRes.data ?? []) as { id: string; nome: string }[]).map((f) => [f.id, f.nome])
  );

  return habilitados
    .filter((h) => h.skus !== null)
    .map((h) => {
      const sku = h.skus as NonNullable<HabilitadoComSku["skus"]>;
      const estoqueAtual = sku.estoque_atual ?? 0;
      const vendas30d = vendasPorSku.get(h.sku_id) ?? 0;
      return {
        sku: sku.sku,
        nomeProduto: sku.nome_produto ?? sku.sku,
        estoqueAtual,
        estoqueMinimo: sku.estoque_minimo ?? 0,
        vendas30d,
        diasAteRuptura: calcularDiasAteRuptura(estoqueAtual, vendas30d),
        pedidosAguardandoEstoque: aguardandoPorSku.get(h.sku_id) ?? 0,
        fornecedorNome: sku.fornecedor_id ? (fornecedorNomePorId.get(sku.fornecedor_id) ?? null) : null,
      };
    });
}

// --- Enriquecimento pós-IA (código puro, não pedido pro modelo) -----------------------

type SkuResultadoIA = {
  sku: string;
  estoque_atual: number;
  vendas_30d: number;
  risco: "alto" | "medio" | "sem_risco" | "dado_insuficiente";
  acao_recomendada: string;
};

export type SkuResultadoEnriquecido = SkuResultadoIA & {
  dias_ate_ruptura: number | null;
  pedidos_aguardando_estoque: number;
  fornecedor_nome: string | null;
  piorou_desde_ontem: boolean;
};

export type ResultadoRupturaEnriquecido = {
  skus: SkuResultadoEnriquecido[];
  destaque_risco_alto: string[];
};

const RANK_RISCO: Record<string, number> = { sem_risco: 0, dado_insuficiente: 1, medio: 2, alto: 3 };

/**
 * Roda depois que a Anthropic devolve o JSON: recalcula dias até ruptura/pedido aguardando/
 * fornecedor com dado FRESCO (não o que foi mandado no submit — o batch pode levar horas) e
 * compara com a rodada anterior pra marcar "piorou desde ontem". Tudo determinístico, não
 * gasta token nem depende do modelo acertar conta.
 */
export async function enriquecerResultadoRuptura(
  sellerId: string,
  resultadoIA: { skus: SkuResultadoIA[]; destaque_risco_alto: string[] }
): Promise<ResultadoRupturaEnriquecido> {
  const [dadosFrescos, anteriorRes] = await Promise.all([
    buscarDadosRupturaFulfillment(sellerId),
    supabaseAdmin
      .from("seller_ai_runs")
      .select("resultado")
      .eq("seller_id", sellerId)
      .eq("gestor", "estoque_fulfillment")
      .eq("status", "ok")
      .order("executado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const dadosPorSku = new Map(dadosFrescos.map((d) => [d.sku, d]));

  const riscoAnteriorPorSku = new Map<string, string>();
  const resultadoAnterior = anteriorRes.data?.resultado as { skus?: { sku: string; risco: string }[] } | null;
  for (const s of resultadoAnterior?.skus ?? []) riscoAnteriorPorSku.set(s.sku, s.risco);

  const skus = resultadoIA.skus.map((s) => {
    const fresco = dadosPorSku.get(s.sku);
    const riscoAnterior = riscoAnteriorPorSku.get(s.sku);
    const piorou =
      riscoAnterior !== undefined && (RANK_RISCO[s.risco] ?? 0) > (RANK_RISCO[riscoAnterior] ?? 0);
    return {
      ...s,
      dias_ate_ruptura: fresco?.diasAteRuptura ?? null,
      pedidos_aguardando_estoque: fresco?.pedidosAguardandoEstoque ?? 0,
      fornecedor_nome: fresco?.fornecedorNome ?? null,
      piorou_desde_ontem: piorou,
    };
  });

  return { skus, destaque_risco_alto: resultadoIA.destaque_risco_alto };
}
