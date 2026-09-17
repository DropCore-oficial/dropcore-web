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
  mlBuscarFaturamentoRealPeriodo,
  mlBuscarPromocaoAtivaItem,
  type MercadoLivreAuthContext,
  type MercadoLivreCampanhaAds,
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
  /** % de afiliado que o seller configurou (só quando a alavanca está ativa). */
  afiliadoPctConfigurado: number | null;
  /** Teto seguro de % de afiliado pra esse SKU sem furar a margem mínima — cálculo
   * determinístico (código, não pedido pra IA), possível porque `calcularMargemRealizada`
   * é linear em `afiliadoPct` (coeficiente -1): subir 1 ponto de afiliado derruba a margem
   * em exatamente 1 ponto. Logo teto = % configurado + folga atual acima do mínimo. `null`
   * quando o afiliado está desativado ou não há folga real (evita sugerir ruído). */
  afiliadoPctTetoSeguro: number | null;
  /** Preço "de tabela" antes do desconto ativo — `null` quando não há desconto rodando. */
  precoOriginal: number | null;
  /** % de desconto rodando agora nesse item específico (0 quando não há). */
  descontoAtivoPct: number;
  /** Nome/tipo da promoção ativa (ex. "DEAL 9.9") — só informativo, pra seller identificar
   * qual campanha é a causa. `null` quando não há desconto ativo. */
  descontoAtivoNome: string | null;
  descontoAtivoFim: string | null;
  /** Desconto MÁXIMO seguro sem furar a margem mínima — cálculo determinístico, resolve
   * `margem(P) = margemMinima` pro preço P, usando só custo+frete (fixos em R$) e
   * comissão+imposto+perda (% do preço) — Ads/afiliado ficam de fora de propósito, são
   * alavancas separadas já cobertas em outro lugar do diagnóstico, e a prioridade
   * combinada é "resolve desconto antes de mexer no resto". `null` quando não há desconto
   * ativo pra reduzir, ou quando nem sem desconto nenhum a margem mínima seria alcançável
   * (custo/comissão/imposto/perda já estouram sozinhos). */
  descontoMaximoSeguroPct: number | null;
  precoMinimoSeguro: number | null;
  /** URL real do item (vinda da própria API do ML) — ver comentário em `permalink` no
   * `MercadoLivreItemDetail`. `null` quando a API não devolveu (raro). */
  permalink: string | null;
  /** family_id do ML (mesmo conceito já usado pelo Andrey) — agrupa variações (tamanho/cor)
   * do mesmo produto que o seller cadastrou como anúncios/SKUs separados. `null` quando o
   * item não pertence a nenhuma família (anúncio isolado). Vem de graça no multiget de
   * `mlBuscarItensDetalhe`, sem chamada extra. */
  familyId: string | null;
};

/** Não é mais amostra pra caber num prompt de IA (2026-09-07: Ulisses não chama a Anthropic
 * nenhuma vez, ver `classificarSkuAds`/`montarResultadoAds` abaixo) — o trabalho caro
 * (frete real, checagem de promoção por item) já roda pra TODO SKU vinculado antes desse
 * corte, então limitar aqui só descartava resultado já pronto sem economizar nada. Fica só
 * como teto de segurança contra catálogo patológico (milhares de SKUs, risco de estourar o
 * `maxDuration` da rota) — hoje (177 SKUs vinculados) nem chega perto disso. */
const MAX_CANDIDATOS = 500;
const CEP_REFERENCIA_FRETE = "01310100";
/** Folga mínima (pontos de margem) pra sugerir subir o % de afiliado — abaixo disso a
 * sugestão seria ruído (ex. "suba de 5% pra 5,4%"), não ajuda o seller a decidir nada. */
const AFILIADO_HEADROOM_MINIMO_PCT = 2;
/** Desconto mínimo (pontos percentuais) pra considerar "tem desconto ativo relevante" —
 * evita ruído de arredondamento de centavo aparecendo como se fosse promoção. */
const DESCONTO_ATIVO_MINIMO_PCT = 1;

/** Resolve o preço mínimo P tal que a margem realizada bate exatamente a margem mínima,
 * usando só os componentes fixos-em-R$ (custo+frete) e percentuais-do-preço (comissão,
 * imposto, perda) — Ads e afiliado ficam de fora de propósito (ver comentário do tipo).
 * `null` quando o denominador zera/vira negativo (nem preço infinito resolveria — custo
 * fixo ou % já estouram a margem mínima sozinhos, sem depender do desconto). */
export function calcularPrecoMinimoSeguro(
  custosFixos: number,
  comissaoPct: number,
  impostoPct: number,
  perdaPct: number,
  margemMinimaPct: number
): number | null {
  const denominador = 100 - comissaoPct - impostoPct - perdaPct - margemMinimaPct;
  if (denominador <= 0) return null;
  return Math.round(((100 * custosFixos) / denominador) * 100) / 100;
}

export async function buscarVinculosComCusto(
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
): Promise<{
  porChave: Map<string, MetricaAdsReal>;
  gastoTotalMes: number;
  vendaAtribuidaTotalMes: number;
  campanhas: MercadoLivreCampanhaAds[];
} | null> {
  const advertiserId = await mlBuscarAdvertiserId(ctx);
  if (!advertiserId) return null;

  const [campanhas, adGroups] = await Promise.all([
    mlBuscarCampanhasAdsComMetricas(ctx, advertiserId, siteId, dateFrom, dateTo),
    mlBuscarAdGroupsComMetricas(ctx, advertiserId, siteId, dateFrom, dateTo),
  ]);

  const gastoTotalMes = campanhas.reduce((soma, c) => soma + (c.metrics?.cost ?? 0), 0);
  // Soma de todas as campanhas (direct_amount + indirect_amount, campo total_amount da API
  // de Ads) — fonte CERTA pro numerador do ROAS de conjunto, mas NUNCA usar isso como
  // "faturamento" (é atribuição de marketing, não pedido real — ver mlBuscarFaturamentoRealPeriodo).
  const vendaAtribuidaTotalMes = campanhas.reduce((soma, c) => soma + (c.metrics?.total_amount ?? 0), 0);

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
  return { porChave, gastoTotalMes, vendaAtribuidaTotalMes, campanhas };
}

export type DiagnosticoCampanha = "sem_conversao" | "acima_da_meta" | "performando_bem" | "dentro_da_meta";

export type CampanhaAdsResultado = {
  id: number;
  nome: string;
  status: string;
  budget: number;
  custoMes: number;
  vendaAtribuidaMes: number;
  unidadesMes: number;
  acosRealPct: number | null;
  acosMetaPct: number;
  diagnostico: DiagnosticoCampanha;
  recomendacao: string;
};

/** Folga (fração do ACOS-alvo) abaixo da qual a campanha está performando bem demais pra
 * não ser mais agressiva — ex. alvo 14,29% × 0.7 = só marca "performando_bem" com ACOS
 * real ≤ 10%. Estouro é o espelho: 20% acima do alvo já é sinal real de problema, não
 * ruído de dia a dia. Cálculo 100% em código (não pedido pra IA) — é comparação
 * determinística, mesmo padrão do teto de afiliado. */
const CAMPANHA_ACOS_FOLGA_FRACAO = 0.7;
const CAMPANHA_ACOS_ESTOURO_FRACAO = 1.2;

function classificarCampanhas(campanhas: MercadoLivreCampanhaAds[]): CampanhaAdsResultado[] {
  return campanhas
    .map((c) => {
      const custoMes = c.metrics?.cost ?? 0;
      const vendaAtribuidaMes = c.metrics?.total_amount ?? 0;
      const unidadesMes = c.metrics?.units_quantity ?? 0;
      const acosRealPct = custoMes > 0 && vendaAtribuidaMes > 0 ? (custoMes / vendaAtribuidaMes) * 100 : null;

      let diagnostico: DiagnosticoCampanha;
      let recomendacao: string;
      if (custoMes > 0 && unidadesMes === 0) {
        diagnostico = "sem_conversao";
        recomendacao = `Gastou R$ ${custoMes.toFixed(2)} sem nenhuma venda atribuída no período — candidata a pausar ou revisar segmentação antes de continuar investindo.`;
      } else if (acosRealPct != null && acosRealPct > c.acos_target * CAMPANHA_ACOS_ESTOURO_FRACAO) {
        diagnostico = "acima_da_meta";
        recomendacao = `ACOS real ${acosRealPct.toFixed(1)}% bem acima da meta de ${c.acos_target.toFixed(1)}% — reduza orçamento ou revise a campanha.`;
      } else if (acosRealPct != null && acosRealPct <= c.acos_target * CAMPANHA_ACOS_FOLGA_FRACAO) {
        diagnostico = "performando_bem";
        recomendacao = `ACOS real ${acosRealPct.toFixed(1)}% com folga real da meta de ${c.acos_target.toFixed(1)}% — já converte bem, considere aumentar orçamento pra capturar mais volume.`;
      } else {
        diagnostico = "dentro_da_meta";
        recomendacao =
          acosRealPct != null
            ? `ACOS real ${acosRealPct.toFixed(1)}% dentro do esperado (meta ${c.acos_target.toFixed(1)}%) — sem ação necessária.`
            : "Sem gasto/venda no período — sem ação necessária.";
      }

      return {
        id: c.id,
        nome: c.name,
        status: c.status,
        budget: c.budget,
        custoMes,
        vendaAtribuidaMes,
        unidadesMes,
        acosRealPct,
        acosMetaPct: c.acos_target,
        diagnostico,
        recomendacao,
      };
    })
    .sort((a, b) => b.custoMes - a.custoMes);
}

async function montarCandidatos(
  sellerId: string,
  ctx: MercadoLivreAuthContext,
  prefs: UlissesPreferencias,
  metricasAds: { porChave: Map<string, MetricaAdsReal>; gastoTotalMes: number; vendaAtribuidaTotalMes: number } | null
): Promise<AdsSkuContexto[]> {
  const infoPorItemId = await buscarVinculosComCusto(sellerId);
  if (infoPorItemId.size === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(Array.from(infoPorItemId.keys()), ctx);

  const candidatos: AdsSkuContexto[] = [];
  for (const item of detalhes) {
    const info = infoPorItemId.get(item.id);
    // Achado ao vivo 2026-09-08: anúncio sem estoque some da vitrine e o próprio ML pausa
    // sozinho (status "paused", sub_status "out_of_stock") — não faz sentido recomendar
    // preço/margem pra algo que não está à venda agora. Pulando aqui em vez de só na UI:
    // evita gastar a chamada de frete real (que ia falhar com 404 mesmo) pra esses itens.
    if (!info || item.price <= 0 || item.status !== "active") continue;

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

    const afiliadoPctConfigurado = prefs.afiliadoAtivo ? (prefs.afiliadoPct ?? 0) : null;
    const headroomAfiliado = margemAtualPct - prefs.margemMinimaPct;
    const afiliadoPctTetoSeguro =
      afiliadoPctConfigurado != null && headroomAfiliado > AFILIADO_HEADROOM_MINIMO_PCT
        ? Math.round((afiliadoPctConfigurado + headroomAfiliado) * 10) / 10
        : null;

    const precoOriginal = item.original_price ?? null;
    const descontoAtivoPct =
      precoOriginal != null && precoOriginal > item.price ? ((precoOriginal - item.price) / precoOriginal) * 100 : 0;

    // Preço mínimo seguro — piso de margem mínima — calculado SEMPRE agora (2026-09-08,
    // pedido do Sr Stark: "todo produto tem que estar em promoção", não só quem já tem
    // desconto ativo). Antes só rodava dentro do `if` de desconto ativo; virou cálculo
    // puro sobre custo/frete (já buscado de qualquer forma), sem custo de API extra.
    const custosFixosSemAds = info.custo + (freteReal ?? 0);
    const precoMinimoSeguro = calcularPrecoMinimoSeguro(
      custosFixosSemAds,
      comissaoPct,
      prefs.impostoPct,
      prefs.perdaPct,
      prefs.margemMinimaPct
    );

    let descontoAtivoNome: string | null = null;
    let descontoAtivoFim: string | null = null;
    let descontoMaximoSeguroPct: number | null = null;
    if (descontoAtivoPct > DESCONTO_ATIVO_MINIMO_PCT && precoOriginal != null) {
      const promosAtivas = await mlBuscarPromocaoAtivaItem(item.id, ctx);
      const promo = promosAtivas[0];
      descontoAtivoNome = promo ? `${promo.type}${promo.name ? ` "${promo.name}"` : ""}` : null;
      descontoAtivoFim = promo?.finish_date?.slice(0, 10) ?? null;
      descontoMaximoSeguroPct =
        precoMinimoSeguro != null ? Math.max(0, Math.round(((precoOriginal - precoMinimoSeguro) / precoOriginal) * 1000) / 10) : null;
    }

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
      afiliadoPctConfigurado,
      afiliadoPctTetoSeguro,
      precoOriginal,
      descontoAtivoPct,
      descontoAtivoNome,
      descontoAtivoFim,
      descontoMaximoSeguroPct,
      precoMinimoSeguro,
      permalink: item.permalink ?? null,
      familyId: item.family_id != null ? String(item.family_id) : null,
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
  /** ROAS de conjunto do mês: venda ATRIBUÍDA ao Ads (todas campanhas) ÷ gasto de Ads —
   * mede o retorno do próprio clique pago. `null` sem Ads habilitado. */
  roasContaMes: number | null;
  /** TACoS de conjunto do mês: gasto de Ads ÷ faturamento REAL total (pedido pago de
   * verdade, não a atribuição de Ads) — mede quanto da receita virou custo de mídia paga.
   * Achado 2026-09-03: usar o total_amount da API de Ads aqui subestima o faturamento real
   * (chegou a menos de 1/3 numa conta testada), por isso busca pedido real à parte. */
  tacosContaRealMes: number | null;
  faturamentoRealMes: number;
  /** 1 linha por campanha ativa, pior gasto primeiro — diagnóstico 100% em código
   * (ACOS real vs. meta que o próprio seller configurou na campanha). */
  campanhas: CampanhaAdsResultado[];
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

  const [metricasAds, promocoesAtivas, afiliadoReal, faturamentoRealMes] = await Promise.all([
    buscarMetricasAdsPorChave(ctx, siteId, periodoInicio, periodoFim),
    mlBuscarPromocoesAtivas(ctx),
    mlBuscarGastoAfiliadoReal(ctx),
    mlBuscarFaturamentoRealPeriodo(ctx, inicioMes.toISOString(), hoje.toISOString()),
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

  const gastoTotalMes = metricasAds?.gastoTotalMes ?? null;
  const roasContaMes =
    gastoTotalMes != null && gastoTotalMes > 0 ? (metricasAds?.vendaAtribuidaTotalMes ?? 0) / gastoTotalMes : null;
  const tacosContaRealMes = gastoTotalMes != null && faturamentoRealMes > 0 ? (gastoTotalMes / faturamentoRealMes) * 100 : null;
  const campanhas = classificarCampanhas(metricasAds?.campanhas ?? []);

  return {
    candidatos,
    prefs,
    promocoesContaResumo,
    cupomAtivoNaConta,
    adsGastoTotalMes: gastoTotalMes,
    afiliadoGastoRealConta: afiliadoReal.gastoReal,
    periodoInicio,
    periodoFim,
    roasContaMes,
    tacosContaRealMes,
    faturamentoRealMes,
    campanhas,
  };
}

// --- Diagnóstico + recomendação — código puro, sem IA -----------------------
//
// Achado 2026-09-07: reler os textos que a IA gerava aqui mostrou que não existe
// julgamento ambíguo nenhum — é sempre comparação de número contra limite (margem atual
// vs. mínima/máxima, TACoS real vs. meta), igual ao que `classificarCampanhas` (acima)
// já fazia sem IA desde o início. Gastar tokens da Anthropic pra "decidir" algo que só
// tem uma resposta certa era desperdício — pior, arriscava truncar/variar a redação sem
// motivo. Ver memória de projeto "Briefing Gestores de IA", seção 2026-09-07.

export type DiagnosticoAds = "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";

/** Mesma fração usada em `classificarCampanhas` (ACOS) — reaproveitada aqui pro TACoS por
 * SKU: 20% acima da meta já é estouro real, não ruído de dia a dia. */
const TACOS_ESTOURO_FRACAO = CAMPANHA_ACOS_ESTOURO_FRACAO;

function classificarSkuAds(
  c: AdsSkuContexto,
  prefs: UlissesPreferencias
): { diagnostico: DiagnosticoAds; recomendacao: string; observacao: string } {
  const temAds = c.adsGastoMesReal > 0;
  const metaTacos = prefs.adsAtivo ? prefs.adsTacosPct : null;
  const tacosEstourado = temAds && metaTacos != null && c.tacosRealPct > metaTacos * TACOS_ESTOURO_FRACAO;

  if (c.margemAtualPct < c.margemMinimaPct) {
    let recomendacao: string;
    if (c.descontoAtivoPct > DESCONTO_ATIVO_MINIMO_PCT) {
      recomendacao = temAds
        ? "Desconto ativo já está furando a margem mínima — reduza/pause Ads neste anúncio até resolver o preço."
        : "Desconto ativo furando a margem mínima — resolva o preço antes de considerar Ads.";
    } else if (temAds && tacosEstourado) {
      recomendacao = `TACoS real ${c.tacosRealPct.toFixed(1)}% bem acima da meta de ${(metaTacos as number).toFixed(1)}%, e a margem já está abaixo do mínimo — reduza ou pause Ads neste anúncio.`;
    } else if (temAds) {
      recomendacao = "Reduzir/pausar Ads neste anúncio e revisar preço - custo+frete já consome a margem antes do Ads.";
    } else {
      recomendacao = "Margem já abaixo do mínimo sem nem contar Ads — revise custo, frete ou preço de venda.";
    }
    const observacao =
      temAds && metaTacos != null
        ? tacosEstourado
          ? `TACoS real ${c.tacosRealPct.toFixed(1)}% acima da meta ${metaTacos.toFixed(1)}%.`
          : `TACoS real ${c.tacosRealPct.toFixed(1)}% perto/dentro da meta ${metaTacos.toFixed(1)}%, mas margem negativa mesmo assim; problema é preço/custo, não só Ads.`
        : "";
    return { diagnostico: "margem_abaixo_minima", recomendacao, observacao };
  }

  // Sem nenhuma promoção ativa e com espaço até o piso de margem mínima — regra do Sr Stark
  // (2026-09-08): "todo produto tem que estar em promoção". Vale tanto pra quem já está
  // acima do máximo quanto pra quem está só dentro da faixa (nesse caso não tem sobra de
  // margem que "excede", mas ainda dá pra promocionar sem furar o mínimo).
  const semPromocaoComEspaco = c.descontoAtivoPct <= DESCONTO_ATIVO_MINIMO_PCT && c.precoMinimoSeguro != null && c.preco > c.precoMinimoSeguro;
  const sugestaoPromocional = semPromocaoComEspaco
    ? `Sem nenhuma promoção ativa — dá pra vender a partir de R$ ${(c.precoMinimoSeguro as number).toFixed(2)} sem furar o mínimo de ${c.margemMinimaPct}%.`
    : null;

  if (c.margemMaximaPct != null && c.margemAtualPct > c.margemMaximaPct) {
    const partes: string[] = [];
    if (sugestaoPromocional) partes.push(sugestaoPromocional);
    if (c.afiliadoPctConfigurado != null && c.afiliadoPctTetoSeguro != null) {
      partes.push(
        `afiliado ativo em ${c.afiliadoPctConfigurado.toFixed(1)}%, dá pra subir até ${c.afiliadoPctTetoSeguro.toFixed(1)}% sem furar o mínimo`
      );
    }
    if (prefs.adsAtivo) {
      partes.push("considere aumentar investimento em Ads pra ganhar mais volume, a margem aguenta");
    }
    const recomendacao =
      partes.length > 0
        ? `Margem acima do máximo desejado — ${partes.join("; ")}.`
        : 'Margem acima do máximo desejado, mas nenhuma alavanca (Ads/afiliado/cupom) está ligada — ative alguma em "Editar preferências" se quiser usar essa folga.';
    return { diagnostico: "margem_acima_maxima", recomendacao, observacao: "" };
  }

  const observacao =
    temAds && metaTacos != null && tacosEstourado
      ? `TACoS real ${c.tacosRealPct.toFixed(1)}% acima da meta ${metaTacos.toFixed(1)}%, mas margem ainda dentro da faixa.`
      : "";
  return {
    diagnostico: "margem_saudavel",
    recomendacao: sugestaoPromocional ?? "Margem dentro da faixa desejada — sem ação necessária.",
    observacao,
  };
}

export type SkuResultadoEnriquecido = {
  sku: string;
  margem_atual_pct: number;
  diagnostico: DiagnosticoAds;
  recomendacao: string;
  observacao: string;
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
  afiliado_pct_configurado: number | null;
  afiliado_pct_teto_seguro: number | null;
  preco_original: number | null;
  desconto_ativo_pct: number;
  desconto_ativo_nome: string | null;
  desconto_ativo_fim: string | null;
  desconto_maximo_seguro_pct: number | null;
  preco_minimo_seguro: number | null;
  permalink: string | null;
  sinalizado_rodada_anterior: boolean;
  family_id: string | null;
};

export type ResultadoAdsEnriquecido = {
  skus: SkuResultadoEnriquecido[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  afiliado_gasto_real_conta: number;
  /** ROAS de conjunto (venda atribuída ao Ads ÷ gasto) — mede o retorno da mídia paga em si. */
  roas_conta_mes: number | null;
  /** TACoS de conjunto (gasto de Ads ÷ faturamento REAL, pedido pago) — mede quanto da
   * receita virou custo de mídia paga. Nunca confundir os dois: ver comentário em
   * AdsContextoCompleto. */
  tacos_conta_real_mes: number | null;
  faturamento_real_mes: number;
  campanhas: CampanhaAdsResultadoJson[];
};

export type CampanhaAdsResultadoJson = {
  id: number;
  nome: string;
  status: string;
  budget: number;
  custo_mes: number;
  venda_atribuida_mes: number;
  unidades_mes: number;
  acos_real_pct: number | null;
  acos_meta_pct: number;
  diagnostico: DiagnosticoCampanha;
  recomendacao: string;
};

function campanhaParaJson(c: CampanhaAdsResultado): CampanhaAdsResultadoJson {
  return {
    id: c.id,
    nome: c.nome,
    status: c.status,
    budget: c.budget,
    custo_mes: c.custoMes,
    venda_atribuida_mes: c.vendaAtribuidaMes,
    unidades_mes: c.unidadesMes,
    acos_real_pct: c.acosRealPct,
    acos_meta_pct: c.acosMetaPct,
    diagnostico: c.diagnostico,
    recomendacao: c.recomendacao,
  };
}

/** Monta o resultado inteiro do gestor Ads/Preço/Promoção — 100% código, sem chamar a
 * Anthropic (ver comentário "Diagnóstico + recomendação" acima). `null` só quando não há
 * dado suficiente (mesmo caso que antes retornava erro 422 na rota). */
export async function montarResultadoAds(sellerId: string): Promise<ResultadoAdsEnriquecido | null> {
  const dadosContexto = await buscarDadosAds(sellerId);
  if (!dadosContexto) return null;

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

  const skus: SkuResultadoEnriquecido[] = dadosContexto.candidatos.map((c) => {
    const { diagnostico, recomendacao, observacao } = classificarSkuAds(c, dadosContexto.prefs);
    return {
      sku: c.sku,
      margem_atual_pct: c.margemAtualPct,
      diagnostico,
      recomendacao,
      observacao,
      item_id: c.itemId,
      nome_produto: c.nomeProduto,
      preco: c.preco,
      custo: c.custo,
      tipo_anuncio: c.tipoAnuncio,
      ads_gasto_mes_real: c.adsGastoMesReal,
      ads_vendas_mes_real: c.adsVendasMesReal,
      tacos_real_pct: c.tacosRealPct,
      roas_real: c.roasReal,
      frete_real: c.freteReal,
      margem_minima_pct: c.margemMinimaPct,
      margem_maxima_pct: c.margemMaximaPct,
      afiliado_pct_configurado: c.afiliadoPctConfigurado,
      afiliado_pct_teto_seguro: c.afiliadoPctTetoSeguro,
      preco_original: c.precoOriginal,
      desconto_ativo_pct: c.descontoAtivoPct,
      desconto_ativo_nome: c.descontoAtivoNome,
      desconto_ativo_fim: c.descontoAtivoFim,
      desconto_maximo_seguro_pct: c.descontoMaximoSeguroPct,
      preco_minimo_seguro: c.precoMinimoSeguro,
      permalink: c.permalink,
      sinalizado_rodada_anterior: diagnostico !== "margem_saudavel" && problemaAnteriorPorSku.has(c.sku),
      family_id: c.familyId,
    };
  });

  const destaqueAtencao = skus.filter((s) => s.diagnostico === "margem_abaixo_minima").map((s) => s.sku);

  return {
    skus,
    destaque_atencao: destaqueAtencao,
    ads_gasto_total_mes: dadosContexto.adsGastoTotalMes,
    afiliado_gasto_real_conta: dadosContexto.afiliadoGastoRealConta,
    roas_conta_mes: dadosContexto.roasContaMes,
    tacos_conta_real_mes: dadosContexto.tacosContaRealMes,
    faturamento_real_mes: dadosContexto.faturamentoRealMes,
    campanhas: dadosContexto.campanhas.map(campanhaParaJson),
  };
}
