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

// --- Risco + ação recomendada — código puro, sem IA -----------------------
//
// Achado 2026-09-07 (mesmo padrão do Ulisses, ver gestorAdsDados.ts): classificar risco a
// partir de dias-até-ruptura (já calculado em código) e decidir entre um punhado de ações
// fixas (pausar anúncio, reduzir ads, avisar comprador) não precisa de IA — é comparação
// de número contra limite. Tirar a IA daqui elimina custo de token e risco de truncamento
// sem perder qualidade (a ação já era restrita a essas poucas opções no prompt antigo).

export type Risco = "alto" | "medio" | "sem_risco" | "dado_insuficiente";

/** Limiares em dias — abaixo disso já é urgência real, não estimativa distante. Mesmo
 * espírito das frações de folga/estouro do Ulisses (CAMPANHA_ACOS_*), só que em dias em
 * vez de fração, porque "dias até esgotar" já é a unidade natural aqui. */
const DIAS_RUPTURA_RISCO_ALTO = 7;
const DIAS_RUPTURA_RISCO_MEDIO = 20;

function classificarSkuRuptura(s: SkuRupturaContexto): { risco: Risco; acaoRecomendada: string } {
  if (s.diasAteRuptura === null) {
    return { risco: "dado_insuficiente", acaoRecomendada: "Sem venda recente suficiente pra estimar risco." };
  }

  const semEstoque = s.estoqueAtual <= 0;
  const temPedidoAguardando = s.pedidosAguardandoEstoque > 0;

  if (temPedidoAguardando || semEstoque || s.diasAteRuptura <= DIAS_RUPTURA_RISCO_ALTO) {
    // Pedido já pago esperando estoque é a prioridade máxima (cliente real esperando) —
    // mesma regra que já estava explícita no prompt antigo.
    const acaoRecomendada = temPedidoAguardando
      ? `Avise o(s) ${s.pedidosAguardandoEstoque} comprador(es) pago(s) sobre o prazo — estoque crítico.`
      : "Pause ou despriorize o anúncio até repor o estoque.";
    return { risco: "alto", acaoRecomendada };
  }

  if (s.diasAteRuptura <= DIAS_RUPTURA_RISCO_MEDIO || s.estoqueAtual <= s.estoqueMinimo) {
    return { risco: "medio", acaoRecomendada: "Considere reduzir a verba de Ads nesse anúncio por enquanto." };
  }

  return { risco: "sem_risco", acaoRecomendada: "Estoque saudável — nenhuma ação necessária." };
}

export type SkuResultadoEnriquecido = {
  sku: string;
  estoque_atual: number;
  vendas_30d: number;
  risco: Risco;
  acao_recomendada: string;
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

/** Monta o resultado inteiro do gestor Estoque & Fulfillment — 100% código, sem chamar a
 * Anthropic (ver comentário acima). Compara com a rodada anterior pra marcar "piorou desde
 * ontem", igual antes. */
export async function montarResultadoRuptura(sellerId: string): Promise<ResultadoRupturaEnriquecido> {
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

  const riscoAnteriorPorSku = new Map<string, string>();
  const resultadoAnterior = anteriorRes.data?.resultado as { skus?: { sku: string; risco: string }[] } | null;
  for (const s of resultadoAnterior?.skus ?? []) riscoAnteriorPorSku.set(s.sku, s.risco);

  const skus: SkuResultadoEnriquecido[] = dadosFrescos.map((d) => {
    const { risco, acaoRecomendada } = classificarSkuRuptura(d);
    const riscoAnterior = riscoAnteriorPorSku.get(d.sku);
    const piorou = riscoAnterior !== undefined && (RANK_RISCO[risco] ?? 0) > (RANK_RISCO[riscoAnterior] ?? 0);
    return {
      sku: d.sku,
      estoque_atual: d.estoqueAtual,
      vendas_30d: d.vendas30d,
      risco,
      acao_recomendada: acaoRecomendada,
      dias_ate_ruptura: d.diasAteRuptura,
      pedidos_aguardando_estoque: d.pedidosAguardandoEstoque,
      fornecedor_nome: d.fornecedorNome,
      piorou_desde_ontem: piorou,
    };
  });

  const destaqueRiscoAlto = skus.filter((s) => s.risco === "alto").map((s) => s.sku);

  return { skus, destaque_risco_alto: destaqueRiscoAlto };
}
