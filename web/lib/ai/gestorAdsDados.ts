/**
 * Dado real pro gestor "Ulisses" (Ads/Preço/Promoção): cruza custo real do produto
 * (`skus.custo_base + skus.custo_dropcore`, via `sellerCustoTotalPagoUnitario` — mesma
 * fonte usada na tela de produtos do seller) com o preço já publicado, a comissão do tipo
 * de anúncio (Clássico/Premium), o **gasto real de Ads do mês** (dia 1 até hoje, por
 * família/item, não só o total da conta) e o **frete real** que o ML cobra do seller
 * (`list_cost`) pra calcular a margem REALIZADA de cada SKU — e recomenda ajuste de
 * ads/afiliado/cupom dentro da faixa (mínima/máxima) e dos liga/desliga que o próprio
 * seller configurou em `seller_ulisses_preferencias`.
 *
 * Escopo desta fase: só diagnóstico ("atual vs. sugerido"), nunca aplica preço/cupom/ads
 * de verdade — mesmo padrão de todos os outros gestores no lançamento. Ver plano do
 * gestor / memória de projeto "Briefing Gestores de IA".
 *
 * Ads real (2026-08-31): a API de Publicidade mudou de estrutura em 27/05/2026 (endpoints
 * antigos como `/product_ads/items` foram desativados) — a geração atual usa
 * `ad_group_id`, exige `site_id` no path e header `api-version: 2`. Testado ao vivo contra
 * conta real: `mlBuscarCampanhasAdsComMetricas`/`mlBuscarAdGroupsComMetricas` batem com o
 * "Investimento" mostrado na própria tela de Publicidade do seller.
 *
 * Afiliado (2026-08-31): não existe API dedicada (pesquisado a fundo — "Programa de
 * Afiliados/Criadores" é gerenciado só pelo painel do criador de conteúdo). Solução real
 * encontrada: o extrato de faturamento (`mlBuscarGastoAfiliadoReal`) lista toda cobrança
 * da conta com descrição em texto — uma cobrança de afiliado apareceria lá se existisse.
 * É checado de verdade (não é suposição), mas é agregado da CONTA, não por SKU — o
 * cálculo de margem por SKU ainda usa o % configurado pelo seller como estimativa
 * individual, só que agora sabemos com dado real se existe gasto de afiliado acontecendo
 * na conta ou não. Cupom: sabemos se existe campanha `SELLER_COUPON_CAMPAIGN` ativa na
 * CONTA (real), mas não o desconto % por item específico — usa o % configurado pelo
 * seller como estimativa quando há cupom ativo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PromptTemplate } from "./gestorPrompts";
import { calcularMargemRealizada } from "@/lib/margemCalculo";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarItensDetalhe,
  mlBuscarPromocoesAtivas,
  mlComissaoPorListingType,
  mlBuscarAdvertiserId,
  mlBuscarCampanhasAdsComMetricas,
  mlBuscarAdGroupsComMetricas,
  mlBuscarFreteReal,
  mlBuscarGastoAfiliadoReal,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";

export type UlissesPreferencias = {
  margemMinimaPct: number;
  margemMaximaPct: number | null;
  impostoPct: number;
  perdaPct: number;
  adsAtivo: boolean;
  adsTacosPct: number | null;
  adsTetoValor: number | null;
  adsTetoPeriodo: "dia" | "mes" | null;
  afiliadoAtivo: boolean;
  afiliadoPct: number | null;
  cupomAtivo: boolean;
  cupomPct: number | null;
};

type PreferenciasRow = {
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  imposto_pct: number;
  perda_pct: number;
  ads_ativo: boolean;
  ads_tacos_pct: number | null;
  ads_teto_valor: number | null;
  ads_teto_periodo: "dia" | "mes" | null;
  afiliado_ativo: boolean;
  afiliado_pct: number | null;
  cupom_ativo: boolean;
  cupom_pct: number | null;
};

/** Serviço bypassa RLS (deny-all é só pra anon/authenticated) — mesmo padrão já usado por
 * todo backend/cron deste projeto: `supabaseAdmin.from(...)` direto, sem passar pela RPC
 * (a RPC existe pro caso de chamada direta do client autenticado, ver docs/SCHEMA.md). */
export async function buscarPreferenciasUlisses(sellerId: string): Promise<UlissesPreferencias | null> {
  const { data } = await supabaseAdmin
    .from("seller_ulisses_preferencias")
    .select(
      "margem_minima_pct, margem_maxima_pct, imposto_pct, perda_pct, ads_ativo, ads_tacos_pct, ads_teto_valor, ads_teto_periodo, afiliado_ativo, afiliado_pct, cupom_ativo, cupom_pct"
    )
    .eq("seller_id", sellerId)
    .maybeSingle();
  const row = data as PreferenciasRow | null;
  if (!row) return null;
  return {
    margemMinimaPct: row.margem_minima_pct,
    margemMaximaPct: row.margem_maxima_pct,
    impostoPct: row.imposto_pct,
    perdaPct: row.perda_pct,
    adsAtivo: row.ads_ativo,
    adsTacosPct: row.ads_tacos_pct,
    adsTetoValor: row.ads_teto_valor,
    adsTetoPeriodo: row.ads_teto_periodo,
    afiliadoAtivo: row.afiliado_ativo,
    afiliadoPct: row.afiliado_pct,
    cupomAtivo: row.cupom_ativo,
    cupomPct: row.cupom_pct,
  };
}

export type AdsSkuContexto = {
  sku: string;
  nomeProduto: string;
  itemId: string;
  custo: number;
  preco: number;
  tipoAnuncio: "classico" | "premium" | "desconhecido";
  comissaoPct: number;
  /** Gasto real de Ads nesse produto no mês corrente (dia 1 até hoje), somando todas as
   * variações do grupo — 0 quando não está em nenhuma campanha. */
  adsGastoMesReal: number;
  adsVendasMesReal: number;
  /** TACoS de verdade: gasto de Ads ÷ venda TOTAL do produto (Ads + orgânica) no período —
   * diferente de ACOS (gasto ÷ só a venda atribuída ao clique). */
  tacosRealPct: number;
  /** ROAS de verdade: venda ATRIBUÍDA ao Ads (não a orgânica — ROAS mede o retorno do
   * clique pago em si) ÷ gasto de Ads. Calculado a partir do bruto (`total_amount`/
   * `cost` do ad group), não é um "roas" pronto que a API devolve. */
  roasReal: number;
  /** Frete real que o seller paga (`list_cost`) — null quando a API não devolveu opção. */
  freteReal: number | null;
  /** Margem realizada com os componentes reais já embutidos (ads gasto/vendas reais do
   * mês, frete real) — afiliado continua estimado (sem API pública, ver cabeçalho). */
  margemAtualPct: number;
  margemMinimaPct: number;
  margemMaximaPct: number | null;
};

const MAX_CANDIDATOS = 20;
const CEP_REFERENCIA_FRETE = "01310100";

async function buscarVinculosComCusto(
  sellerId: string
): Promise<Map<string, { sku: string; nomeProduto: string; custo: number }>> {
  const { data: vinculosRaw } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku, ml_item_id")
    .eq("seller_id", sellerId);
  const vinculos = (vinculosRaw ?? []) as { sku: string; ml_item_id: string }[];
  if (vinculos.length === 0) return new Map();

  const skusUnicos = Array.from(new Set(vinculos.map((v) => v.sku)));
  const { data: skusRaw } = await supabaseAdmin
    .from("skus")
    .select("sku, nome_produto, custo_base, custo_dropcore")
    .in("sku", skusUnicos);
  const custoPorSku = new Map(
    (skusRaw ?? []).map((s) => {
      // Fonte única do "custo que o seller paga" (mesma usada em api/seller/produtos) —
      // custo_dropcore vazio não é taxa zero, e valor de taxa desproporcional ao custo
      // base é tratado como dado legado/inconsistente, não somado cru.
      const custo = sellerCustoTotalPagoUnitario(s.custo_base, s.custo_dropcore) ?? 0;
      return [s.sku as string, { nome: (s.nome_produto as string | null) ?? s.sku, custo }];
    })
  );

  const porItemId = new Map<string, { sku: string; nomeProduto: string; custo: number }>();
  for (const v of vinculos) {
    const info = custoPorSku.get(v.sku);
    if (!info || info.custo <= 0) continue;
    porItemId.set(v.ml_item_id, { sku: v.sku, nomeProduto: info.nome, custo: info.custo });
  }
  return porItemId;
}

type MetricaAdsReal = {
  cost: number;
  totalAmount: number;
  unitsQuantity: number;
  organicUnitsQuantity: number;
  organicUnitsAmount: number;
};

/** Soma métricas de Ads reais por chave de agrupamento (family_id quando existe, senão
 * item_id — mesma convenção já usada pelo Andrey). `null` quando o seller não tem Ads
 * habilitado nessa conta (não é erro, ver `mlBuscarAdvertiserId`). */
async function buscarMetricasAdsPorChave(
  ctx: MercadoLivreAuthContext,
  siteId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ porChave: Map<string, MetricaAdsReal>; gastoTotalMes: number } | null> {
  const advertiserId = await mlBuscarAdvertiserId(ctx);
  if (!advertiserId) return null;

  const [campanhas, adGroups] = await Promise.all([
    mlBuscarCampanhasAdsComMetricas(ctx, advertiserId, siteId, dateFrom, dateTo),
    mlBuscarAdGroupsComMetricas(ctx, advertiserId, siteId, dateFrom, dateTo),
  ]);

  const gastoTotalMes = campanhas.reduce((soma, c) => soma + (c.metrics?.cost ?? 0), 0);

  const porChave = new Map<string, MetricaAdsReal>();
  for (const ag of adGroups) {
    if (!ag.metrics) continue;
    const atual = porChave.get(ag.ad_group_external_id) ?? {
      cost: 0,
      totalAmount: 0,
      unitsQuantity: 0,
      organicUnitsQuantity: 0,
      organicUnitsAmount: 0,
    };
    porChave.set(ag.ad_group_external_id, {
      cost: atual.cost + ag.metrics.cost,
      totalAmount: atual.totalAmount + ag.metrics.total_amount,
      unitsQuantity: atual.unitsQuantity + ag.metrics.units_quantity,
      organicUnitsQuantity: atual.organicUnitsQuantity + (ag.metrics.organic_units_quantity ?? 0),
      organicUnitsAmount: atual.organicUnitsAmount + (ag.metrics.organic_units_amount ?? 0),
    });
  }
  return { porChave, gastoTotalMes };
}

async function montarCandidatos(
  sellerId: string,
  ctx: MercadoLivreAuthContext,
  prefs: UlissesPreferencias,
  metricasAds: { porChave: Map<string, MetricaAdsReal>; gastoTotalMes: number } | null
): Promise<AdsSkuContexto[]> {
  const infoPorItemId = await buscarVinculosComCusto(sellerId);
  if (infoPorItemId.size === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(Array.from(infoPorItemId.keys()), ctx);

  const candidatos: AdsSkuContexto[] = [];
  for (const item of detalhes) {
    const info = infoPorItemId.get(item.id);
    if (!info || item.price <= 0) continue;

    const { tipo, comissaoPct } = mlComissaoPorListingType(item.listing_type_id);
    const chaveAds = item.family_id != null ? String(item.family_id) : item.id;
    const metricaAds = metricasAds?.porChave.get(chaveAds);
    const adsGastoMesReal = metricaAds?.cost ?? 0;
    const adsVendasMesReal = metricaAds?.unitsQuantity ?? 0;
    // TACoS de verdade = gasto ÷ venda TOTAL (com Ads + orgânica), não só a venda
    // atribuída ao clique (isso seria ACOS, métrica diferente) — pedido explícito do Sr
    // Stark (2026-08-31): o gasto de Ads beneficia a venda do produto como um todo, então
    // o custo por unidade é rateado pelo total de unidades vendidas no período, não só
    // as que vieram de clique no anúncio.
    const totalUnidadesVendidasMes = adsVendasMesReal + (metricaAds?.organicUnitsQuantity ?? 0);
    const adsPctReal = totalUnidadesVendidasMes > 0 ? (adsGastoMesReal / totalUnidadesVendidasMes / item.price) * 100 : 0;
    const vendaTotalMesReal = (metricaAds?.totalAmount ?? 0) + (metricaAds?.organicUnitsAmount ?? 0);
    const tacosRealPct = vendaTotalMesReal > 0 ? (adsGastoMesReal / vendaTotalMesReal) * 100 : 0;
    // ROAS usa só a venda ATRIBUÍDA ao Ads (total_amount), não a orgânica — mede o
    // retorno do próprio clique pago, diferente do TACoS (que olha a venda toda).
    const roasReal = adsGastoMesReal > 0 ? (metricaAds?.totalAmount ?? 0) / adsGastoMesReal : 0;

    const freteReal = await mlBuscarFreteReal(item.id, ctx, CEP_REFERENCIA_FRETE);

    const margemAtualPct = calcularMargemRealizada({
      precoVenda: item.price,
      custo: info.custo,
      frete: freteReal ?? 0,
      comissaoPct,
      impostoPct: prefs.impostoPct,
      perdaPct: prefs.perdaPct,
      adsPct: adsPctReal,
      // Afiliado sem API pública (ver cabeçalho) — continua estimado pelo % configurado.
      afiliadoPct: prefs.afiliadoAtivo ? (prefs.afiliadoPct ?? 0) : 0,
    });

    candidatos.push({
      sku: info.sku,
      nomeProduto: info.nomeProduto,
      itemId: item.id,
      custo: info.custo,
      preco: item.price,
      tipoAnuncio: tipo,
      comissaoPct,
      adsGastoMesReal,
      adsVendasMesReal,
      tacosRealPct,
      roasReal,
      freteReal,
      margemAtualPct,
      margemMinimaPct: prefs.margemMinimaPct,
      margemMaximaPct: prefs.margemMaximaPct,
    });
  }

  // Prioriza quem está mais longe da margem mínima (pior caso primeiro) — mesmo
  // princípio dos outros gestores (pior situação primeiro, não amostra aleatória).
  return candidatos.sort((a, b) => a.margemAtualPct - b.margemAtualPct).slice(0, MAX_CANDIDATOS);
}

export type AdsContextoCompleto = {
  candidatos: AdsSkuContexto[];
  prefs: UlissesPreferencias;
  promocoesContaResumo: string;
  cupomAtivoNaConta: boolean;
  adsGastoTotalMes: number | null;
  afiliadoGastoRealConta: number;
  periodoInicio: string;
  periodoFim: string;
};

export async function buscarDadosAds(sellerId: string): Promise<AdsContextoCompleto | null> {
  const prefs = await buscarPreferenciasUlisses(sellerId);
  if (!prefs) return null; // wizard ainda não preenchido — sem preferência não dá pra avaliar faixa de margem

  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return null;

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const periodoInicio = inicioMes.toISOString().slice(0, 10);
  const periodoFim = hoje.toISOString().slice(0, 10);
  const siteId = "MLB";

  const [metricasAds, promocoesAtivas, afiliadoReal] = await Promise.all([
    buscarMetricasAdsPorChave(ctx, siteId, periodoInicio, periodoFim),
    mlBuscarPromocoesAtivas(ctx),
    mlBuscarGastoAfiliadoReal(ctx),
  ]);

  const candidatos = await montarCandidatos(sellerId, ctx, prefs, metricasAds);
  if (candidatos.length === 0) return null;

  const cupomAtivoNaConta = promocoesAtivas.some((p) => p.type === "SELLER_COUPON_CAMPAIGN");
  const promocoesContaResumo =
    promocoesAtivas.length === 0
      ? "Nenhuma promoção/campanha ativa na conta no momento."
      : promocoesAtivas
          .map((p) => `${p.type}${p.name ? ` "${p.name}"` : ""} (status ${p.status}${p.finish_date ? `, até ${p.finish_date.slice(0, 10)}` : ""})`)
          .join("; ");

  return {
    candidatos,
    prefs,
    promocoesContaResumo,
    cupomAtivoNaConta,
    adsGastoTotalMes: metricasAds?.gastoTotalMes ?? null,
    afiliadoGastoRealConta: afiliadoReal.gastoReal,
    periodoInicio,
    periodoFim,
  };
}

function formatarCandidatos(ctx: AdsContextoCompleto): string {
  const linhas = ctx.candidatos
    .map((c) => {
      const faixa = c.margemMaximaPct
        ? `faixa desejada ${c.margemMinimaPct}%–${c.margemMaximaPct}%`
        : `mínimo desejado ${c.margemMinimaPct}%`;
      const metaTacos = ctx.prefs.adsAtivo && ctx.prefs.adsTacosPct != null ? ` (meta do seller: ${ctx.prefs.adsTacosPct}%)` : "";
      const adsTxt =
        c.adsGastoMesReal > 0
          ? `Ads no mês: R$ ${c.adsGastoMesReal.toFixed(2)} gastos, ${c.adsVendasMesReal} venda(s) atribuída(s), TACoS real ${c.tacosRealPct.toFixed(1)}%${metaTacos}, ROAS real ${c.roasReal.toFixed(2)}x`
          : "Ads no mês: sem gasto registrado nesse produto";
      const freteTxt = c.freteReal != null ? `frete real R$ ${c.freteReal.toFixed(2)}` : "frete não disponível (estimativa 0)";
      return (
        `- ${c.sku} (${c.nomeProduto}) | anúncio ${c.itemId} (${c.tipoAnuncio}, comissão ${c.comissaoPct}%) | ` +
        `custo R$ ${c.custo.toFixed(2)} | preço atual R$ ${c.preco.toFixed(2)} | ${freteTxt} | ${adsTxt} | ` +
        `margem realizada (com ads/frete reais desse mês): ${c.margemAtualPct.toFixed(1)}% | ${faixa}`
      );
    })
    .join("\n");

  const config = [
    `Ads: ${ctx.prefs.adsAtivo ? `ativo, TACoS alvo ${ctx.prefs.adsTacosPct ?? 0}%${ctx.prefs.adsTetoValor ? `, teto R$ ${ctx.prefs.adsTetoValor}/${ctx.prefs.adsTetoPeriodo}` : ""}` : "desativado pelo seller"}`,
    `Afiliado: ${ctx.prefs.afiliadoAtivo ? `ativo, ${ctx.prefs.afiliadoPct ?? 0}% configurado` : "desativado pelo seller"} | gasto real de afiliado no extrato de faturamento deste período (checado de verdade, não suposição): R$ ${ctx.afiliadoGastoRealConta.toFixed(2)}`,
    `Cupom: ${ctx.prefs.cupomAtivo ? `seller quer usar, ${ctx.prefs.cupomPct ?? 0}%` : "desativado pelo seller"} | cupom SELLER_COUPON_CAMPAIGN ativo na conta agora (dado real): ${ctx.cupomAtivoNaConta ? "sim" : "não"}`,
  ].join(" | ");

  const gastoMesTxt =
    ctx.adsGastoTotalMes != null
      ? `Investimento total em Ads na conta, de ${ctx.periodoInicio} até ${ctx.periodoFim}: R$ ${ctx.adsGastoTotalMes.toFixed(2)}.`
      : "Conta sem Ads (Product Ads) habilitado — sem dado de investimento.";

  return `Configuração do seller: ${config}\n${gastoMesTxt}\nPromoções/campanhas ativas na conta (nível conta, não por SKU): ${ctx.promocoesContaResumo}\n\nSKUs vinculados ao Mercado Livre (pior margem primeiro):\n${linhas}`;
}

export const PROMPT_ADS: PromptTemplate<AdsContextoCompleto> = {
  id: "ads_preco_promocao_diagnostico",
  gestor: "ads",
  titulo: "Diagnóstico de Ads, Preço e Promoção",
  persona:
    "Você é um especialista em precificação e mídia paga de marketplace, focado em manter a " +
    "margem de lucro do vendedor dentro da faixa que ele mesmo definiu, decidindo quando vale " +
    "a pena usar ads, afiliado ou cupom pra vender mais sem sacrificar o resultado financeiro.",
  tarefa: [
    "Para cada SKU, compare a margem realizada (já com ads e frete reais do mês embutidos) com a " +
      "faixa mínima/máxima que o seller definiu.",
    "Classifique cada SKU em: margem_abaixo_minima (perigo, precisa de ação), margem_saudavel " +
      "(dentro da faixa, nenhuma mudança necessária), margem_acima_maxima (oportunidade — sobra " +
      "margem pra ser mais agressivo com promoção/ads e vender mais volume).",
    "Se um SKU já está gastando em Ads e a margem está abaixo do mínimo, considere recomendar " +
      "reduzir ou pausar essa alavanca — é gasto real acontecendo agora, não hipótese. Compare o " +
      "TACoS real (gasto ÷ venda TOTAL do produto, com Ads e orgânica) com a meta que o seller " +
      "configurou — TACoS real bem acima da meta é sinal de que o Ads está custando mais do que " +
      "deveria em relação ao volume de venda total daquele produto.",
    "Só recomende ativar/ajustar afiliado ou cupom se o seller já tiver deixado aquela alavanca " +
      "LIGADA na configuração dele — nunca sugira ligar uma alavanca que está desativada.",
    "Para margem_acima_maxima, sugira usar as alavancas já ligadas pelo seller (dentro do % que " +
      "ele configurou) pra ganhar mais volume, já que a margem projetada com elas ainda ficaria " +
      "dentro ou perto da faixa desejada.",
    "Se houver promoção/campanha ativa na conta (bloco de contexto), considere se ela é relevante " +
      "pra esse SKU e mencione na observação, sem afirmar com certeza que o SKU participa dela " +
      "(a informação é por conta, não por item, deixe isso claro).",
  ],
  restricoes: [
    "Nunca recomende um valor de cupom ou afiliado FORA do que o seller já configurou — você " +
      "decide SE vale usar a alavanca configurada, não decide um número novo. Ads já é dado real " +
      "(gasto que já aconteceu), então pode recomendar reduzir/pausar quando fizer sentido.",
    "Nunca sugira mudar a margem mínima ou máxima do seller — essa faixa é decisão dele, não sua.",
    "Preço/promoção nunca é aplicado sozinho — isso é sempre sugestão pro seller revisar.",
    "observacao curta e direta (o catálogo pode ter vários SKUs analisados de uma vez).",
  ],
  formatoSaida: [
    "Tabela: SKU | Margem atual | Faixa desejada | Diagnóstico | Recomendação | Observação",
    "Bloco final: os SKUs que mais precisam de atenção (margem abaixo do mínimo).",
  ].join("\n"),
  montarContexto: (ctx) => `Meus SKUs vinculados ao Mercado Livre, com margem calculada com dado real:\n${formatarCandidatos(ctx)}`,
};

export const SCHEMA_ADS = {
  type: "object",
  properties: {
    skus: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sku: { type: "string" },
          margem_atual_pct: { type: "number" },
          diagnostico: {
            type: "string",
            enum: ["margem_abaixo_minima", "margem_saudavel", "margem_acima_maxima"],
          },
          recomendacao: { type: "string", maxLength: 140 },
          observacao: { type: "string", maxLength: 140 },
        },
        required: ["sku", "margem_atual_pct", "diagnostico", "recomendacao", "observacao"],
        additionalProperties: false,
      },
    },
    destaque_atencao: {
      type: "array",
      items: { type: "string" },
      description: "SKUs com margem abaixo do mínimo que merecem atenção imediata.",
    },
  },
  required: ["skus", "destaque_atencao"],
  additionalProperties: false,
} as const;

// --- Enriquecimento pós-IA (código puro, não pedido pro modelo) -----------------------

type DiagnosticoAds = "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";

type SkuResultadoIA = {
  sku: string;
  margem_atual_pct: number;
  diagnostico: DiagnosticoAds;
  recomendacao: string;
  observacao: string;
};

export type SkuResultadoEnriquecido = SkuResultadoIA & {
  item_id: string;
  nome_produto: string;
  preco: number;
  custo: number;
  tipo_anuncio: "classico" | "premium" | "desconhecido";
  ads_gasto_mes_real: number;
  ads_vendas_mes_real: number;
  tacos_real_pct: number;
  roas_real: number;
  frete_real: number | null;
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  sinalizado_rodada_anterior: boolean;
};

export type ResultadoAdsEnriquecido = {
  skus: SkuResultadoEnriquecido[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  afiliado_gasto_real_conta: number;
};

export async function enriquecerResultadoAds(
  sellerId: string,
  resultadoIA: { skus: SkuResultadoIA[]; destaque_atencao: string[] }
): Promise<ResultadoAdsEnriquecido> {
  const dadosContexto = await buscarDadosAds(sellerId);
  const porSku = new Map((dadosContexto?.candidatos ?? []).map((c) => [c.sku, c]));

  const { data: anteriorRow } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("resultado")
    .eq("seller_id", sellerId)
    .eq("gestor", "ads")
    .eq("status", "ok")
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const problemaAnteriorPorSku = new Set<string>();
  const resultadoAnterior = anteriorRow?.resultado as { skus?: { sku: string; diagnostico: string }[] } | null;
  for (const s of resultadoAnterior?.skus ?? []) {
    if (s.diagnostico !== "margem_saudavel" && s.sku) problemaAnteriorPorSku.add(s.sku);
  }

  const skus = resultadoIA.skus.map((s) => {
    const c = porSku.get(s.sku);
    return {
      ...s,
      item_id: c?.itemId ?? "",
      nome_produto: c?.nomeProduto ?? s.sku,
      preco: c?.preco ?? 0,
      custo: c?.custo ?? 0,
      tipo_anuncio: c?.tipoAnuncio ?? "desconhecido",
      ads_gasto_mes_real: c?.adsGastoMesReal ?? 0,
      ads_vendas_mes_real: c?.adsVendasMesReal ?? 0,
      tacos_real_pct: c?.tacosRealPct ?? 0,
      roas_real: c?.roasReal ?? 0,
      frete_real: c?.freteReal ?? null,
      margem_minima_pct: c?.margemMinimaPct ?? 0,
      margem_maxima_pct: c?.margemMaximaPct ?? null,
      sinalizado_rodada_anterior: s.diagnostico !== "margem_saudavel" && problemaAnteriorPorSku.has(s.sku),
    };
  });

  return {
    skus,
    destaque_atencao: resultadoIA.destaque_atencao,
    ads_gasto_total_mes: dadosContexto?.adsGastoTotalMes ?? null,
    afiliado_gasto_real_conta: dadosContexto?.afiliadoGastoRealConta ?? 0,
  };
}
