/**
 * Dado real do gestor Ulisses (Ads/Preço) pro assinante avulso "Gestores de IA" — v1 enxuto
 * de propósito, bem menor que o hub (`gestorAdsDados.ts`, 950+ linhas com gasto real de Ads,
 * afiliado, cupom, classificação de campanha). Escopo combinado com o Sr Stark: só margem
 * (preço − custo digitado − frete real − comissão − imposto − perda), sem Ads/afiliado/
 * cupom/campanha — isso fica pra v2, depois de validar o core.
 *
 * Diferença estrutural vs. o hub: avulso não tem `skus.custo_base` (não tem catálogo de
 * fornecedor) — o assinante digita o custo manualmente por anúncio/família
 * (`calculadora_assinante_ulisses_custos`, acesso via RPC, ver fn_calculadora_assinante_
 * ulisses_custo_upsert/custos_list). Preferências (margem mínima/máxima, imposto, perda)
 * também via RPC (`calculadora_assinante_ulisses_preferencias`).
 *
 * 100% código, sem IA — mesma decisão do hub (2026-09-07): margem atual vs. mínima/máxima é
 * comparação de número, não julgamento ambíguo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calcularMargemRealizada, calcularPrecoPisoFormal } from "@/lib/margemCalculo";
import {
  buscarMetricasAdsPorChave,
  classificarCampanhas,
  campanhaParaJson,
} from "./gestorAdsDados";
import {
  mlBuscarItensAtivos,
  mlBuscarItensDetalhe,
  mlComissaoPorListingType,
  mlBuscarCustoRealEnvioParaDestino,
  mlBuscarPromocoesAtivas,
  mlBuscarPromocaoAtivaItem,
  mlBuscarAdvertiserId,
  mlBuscarCampanhasAdsComMetricas,
  mlBuscarResumoPedidosPeriodo,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import type { Risco } from "./gestorEstoqueDadosAvulso";

export type UlissesPreferenciasAvulso = {
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
  /** Piso de preço formal (Margem) — embalagem/custoFull existem desde 2026-10-11 mas nunca
   * tinham sido lidos por código nenhum até agora; devolução/ACOS são novos. Todos com
   * default 0 no banco, então "não configurado" e "configurado como zero" são
   * indistinguíveis de propósito (0 é um valor válido pra todos esses campos). */
  embalagemBrl: number;
  custoFullBrl: number;
  devolucaoTaxaPct: number;
  devolucaoCustoBrl: number;
  acosAlvoPct: number;
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
  embalagem_brl: number;
  custo_full_brl: number;
  devolucao_taxa_pct: number;
  devolucao_custo_brl: number;
  acos_alvo_pct: number;
};

function linhaParaPreferencias(row: PreferenciasRow): UlissesPreferenciasAvulso {
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
    embalagemBrl: row.embalagem_brl,
    custoFullBrl: row.custo_full_brl,
    devolucaoTaxaPct: row.devolucao_taxa_pct,
    devolucaoCustoBrl: row.devolucao_custo_brl,
    acosAlvoPct: row.acos_alvo_pct,
  };
}

export async function buscarPreferenciasUlissesAvulso(assinanteId: string): Promise<UlissesPreferenciasAvulso | null> {
  const { data, error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ulisses_preferencias_get", {
    p_assinante_id: assinanteId,
  });
  if (error) throw new Error(error.message);
  const row = data as PreferenciasRow | null;
  return row ? linhaParaPreferencias(row) : null;
}

export async function salvarPreferenciasUlissesAvulso(
  assinanteId: string,
  prefs: UlissesPreferenciasAvulso
): Promise<UlissesPreferenciasAvulso> {
  const { data, error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ulisses_preferencias_upsert", {
    p_assinante_id: assinanteId,
    p_margem_minima_pct: prefs.margemMinimaPct,
    p_margem_maxima_pct: prefs.margemMaximaPct,
    p_imposto_pct: prefs.impostoPct,
    p_perda_pct: prefs.perdaPct,
    p_ads_ativo: prefs.adsAtivo,
    p_ads_tacos_pct: prefs.adsAtivo ? prefs.adsTacosPct : null,
    p_ads_teto_valor: prefs.adsAtivo ? prefs.adsTetoValor : null,
    p_ads_teto_periodo: prefs.adsAtivo ? prefs.adsTetoPeriodo : null,
    p_afiliado_ativo: prefs.afiliadoAtivo,
    p_afiliado_pct: prefs.afiliadoAtivo ? prefs.afiliadoPct : null,
    p_cupom_ativo: prefs.cupomAtivo,
    p_cupom_pct: prefs.cupomAtivo ? prefs.cupomPct : null,
    p_embalagem_brl: prefs.embalagemBrl,
    p_custo_full_brl: prefs.custoFullBrl,
    p_devolucao_taxa_pct: prefs.devolucaoTaxaPct,
    p_devolucao_custo_brl: prefs.devolucaoCustoBrl,
    p_acos_alvo_pct: prefs.acosAlvoPct,
  });
  if (error) throw new Error(error.message);
  return linhaParaPreferencias(data as PreferenciasRow);
}

type CustoRow = { chave: string; custo: number };

export async function buscarCustosUlissesAvulso(assinanteId: string): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ulisses_custos_list", {
    p_assinante_id: assinanteId,
  });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as CustoRow[]).map((r) => [r.chave, Number(r.custo)]));
}

export async function salvarCustoUlissesAvulso(assinanteId: string, chave: string, custo: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ulisses_custo_upsert", {
    p_assinante_id: assinanteId,
    p_chave: chave,
    p_custo: custo,
  });
  if (error) throw new Error(error.message);
}

export async function removerCustoUlissesAvulso(assinanteId: string, chave: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fn_calculadora_assinante_ulisses_custo_delete", {
    p_assinante_id: assinanteId,
    p_chave: chave,
  });
  if (error) throw new Error(error.message);
}

// --- Catálogo (grupos por família/item) — usado tanto pela tela de "digitar custo" quanto
// pelo diagnóstico de margem. -------------------------------------------------------------

export type CatalogoGrupoAvulso = {
  chave: string;
  itemIdRepresentante: string;
  nomeProduto: string;
  preco: number;
  membros: { itemId: string; titulo: string }[];
};

const MAX_CANDIDATOS = 100;

async function buscarCatalogoAgrupado(ctx: MercadoLivreAuthContext): Promise<CatalogoGrupoAvulso[]> {
  const ids = await mlBuscarItensAtivos(ctx, MAX_CANDIDATOS);
  if (ids.length === 0) return [];
  const detalhes = await mlBuscarItensDetalhe(ids, ctx);

  const porChave = new Map<string, typeof detalhes>();
  for (const item of detalhes) {
    if (item.status !== "active" || item.price <= 0) continue;
    const chave = item.family_id != null ? String(item.family_id) : item.id;
    const grupo = porChave.get(chave) ?? [];
    grupo.push(item);
    porChave.set(chave, grupo);
  }

  return Array.from(porChave.entries()).map(([chave, membros]) => {
    const representante = [...membros].sort((a, b) => b.price - a.price)[0];
    return {
      chave,
      itemIdRepresentante: representante.id,
      nomeProduto: representante.title,
      preco: representante.price,
      membros: membros.map((m) => ({ itemId: m.id, titulo: m.title })),
    };
  });
}

/** Catálogo pra tela de "digitar custo" — grupo + custo já salvo (null se ainda não digitou). */
export async function buscarCatalogoComCustoAvulso(
  assinanteId: string
): Promise<{ grupo: CatalogoGrupoAvulso; custo: number | null }[] | null> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;
  const [grupos, custos] = await Promise.all([buscarCatalogoAgrupado(ctx), buscarCustosUlissesAvulso(assinanteId)]);
  return grupos
    .map((grupo) => ({ grupo, custo: custos.get(grupo.chave) ?? null }))
    .sort((a, b) => {
      // Sem custo cadastrado primeiro — é o que falta pro assinante fazer pra habilitar o diagnóstico.
      if ((a.custo === null) !== (b.custo === null)) return a.custo === null ? -1 : 1;
      return a.grupo.nomeProduto.localeCompare(b.grupo.nomeProduto);
    });
}

// --- Diagnóstico de margem — 100% código, sem IA --------------------------------------

export type DiagnosticoAdsAvulso = "sem_custo" | "margem_abaixo_minima" | "margem_saudavel" | "margem_acima_maxima";

export type SkuResultadoAdsAvulso = {
  chave: string;
  item_id_representante: string;
  nome_produto: string;
  preco: number;
  custo: number | null;
  tipo_anuncio: "classico" | "premium" | "desconhecido";
  comissao_pct: number;
  frete_real: number | null;
  diagnostico: DiagnosticoAdsAvulso;
  margem_atual_pct: number | null;
  margem_minima_pct: number;
  margem_maxima_pct: number | null;
  /** Imposto/perda configurados nas preferências — repetidos aqui (mesmo valor em todo SKU
   * da rodada) pra o card poder mostrar a conta completa sem precisar buscar preferências à
   * parte. */
  imposto_pct: number;
  perda_pct: number;
  preco_minimo_seguro: number | null;
  permalink: string | null;
  /** Gasto real de Ads nesse grupo no mês corrente (dia 1 até hoje) — 0 quando não está em
   * nenhuma campanha ou o assinante não tem Ads habilitado na conta. */
  ads_gasto_mes_real: number;
  ads_vendas_mes_real: number;
  tacos_real_pct: number;
  roas_real: number;
  /** % de afiliado configurado (só quando a alavanca está ativa nas preferências). */
  afiliado_pct_configurado: number | null;
  /** Teto seguro de % de afiliado sem furar a margem mínima — `null` quando afiliado
   * desativado ou sem folga real (margem já perto do mínimo). */
  afiliado_pct_teto_seguro: number | null;
  preco_original: number | null;
  desconto_ativo_pct: number;
  /** Código do tipo (ex. `SELLER_CAMPAIGN`, `SMART`, `LIGHTNING`) — front traduz via
   * `PROMOCAO_TIPO_LABEL`, mesmo mapa já usado em `PromocaoContaLinha` (separado do nome
   * desde 2026-10-17; antes vinha concatenado cru `"SELLER_CAMPAIGN \"DESCONTO OUTUBRO\""`,
   * ilegível e inconsistente com o resto da tela). */
  desconto_ativo_tipo: string | null;
  /** Nome que o próprio seller deu à campanha (ex. "DESCONTO OUTUBRO") — `null` quando o
   * tipo não tem nome customizado (ex. Oferta Relâmpago). */
  desconto_ativo_nome: string | null;
  desconto_ativo_fim: string | null;
  /** Todos os anúncios (item_id) que compõem essa família — aplicar promoção precisa atingir
   * todo mundo, não só o representante (mesmo achado real do botão de pausar do Estoque). */
  membros: { item_id: string; titulo: string }[];
  /** Risco de ruptura (Estoque avulso) na mesma família, lido da última rodada salva —
   * `null` quando o assinante nunca rodou o Estoque ainda. Não bloqueia a promoção, só avisa
   * antes de aplicar. */
  risco_ruptura_estoque: Risco | null;
};

/** 1 promoção/campanha ativa ou agendada na conta (não por produto — isso é o
 * `desconto_ativo_*` do `SkuResultadoAdsAvulso`). Estruturado em vez de string concatenada
 * (`type "nome" (status X, até Y); type "nome" (...); ...`) pra o front poder montar uma
 * linha por campanha em vez de um parágrafo ilegível — achado 2026-10-15. */
export type PromocaoContaResumo = {
  tipo: string;
  nome: string | null;
  status: string;
  fim: string | null;
};

export type ResultadoAdsAvulsoEnriquecido = {
  skus: SkuResultadoAdsAvulso[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  cupom_ativo_na_conta: boolean;
  promocoes_conta: PromocaoContaResumo[];
  campanhas: ReturnType<typeof campanhaParaJson>[];
  /** Calendário fixo curado (não vem de API — pesquisado 2026-10-17: o Mercado Livre não
   * expõe endpoint de leitura de calendário comercial, só `POST` de campanha própria). */
  calendario_datas_fortes: DataComercial[];
  /** Dado real da própria conta (soma de campanhas de Ads nos últimos 90 dias) — `null`
   * quando a conta nunca teve Ads habilitado/nunca gastou nada no período, pra não mostrar
   * bloco zerado sem sentido. Nunca é projeção/estimativa. */
  historico_ads_real: HistoricoAdsReal;
  /** Métrica de valor (B5) — pra cada promoção aplicada recentemente via botão, quantas
   * unidades venderam de verdade desde então. Puramente descritivo, nunca afirma causa. */
  valor_acoes_recentes: ValorAcaoAdsAvulso[];
};

// --- Calendário de datas comerciais fortes — fixo, curado, sem API (2026-10-17) ------------
//
// Mercado Livre não expõe endpoint de leitura de calendário promocional (testado ao vivo:
// `/seller-promotions/users/{id}/offers` 404, `/marketplace/seller-promotions/seller-
// campaign/{id}` existe mas só aceita POST pra criar campanha própria, não lista datas).
// Datas variáveis (Black Friday/Dia das Mães/Dia dos Pais) são calculadas, não hardcoded por
// ano, pra não ficar stale — fixas (Natal, Dia dos Namorados etc.) usam o mesmo dia todo ano.

export type DataComercial = { nome: string; data: string; dias_restantes: number };

function nthWeekday(ano: number, mes0: number, diaSemana: number, n: number): Date {
  const primeiro = new Date(ano, mes0, 1);
  const diff = (diaSemana - primeiro.getDay() + 7) % 7;
  return new Date(ano, mes0, 1 + diff + (n - 1) * 7);
}

function lastWeekday(ano: number, mes0: number, diaSemana: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0);
  const diff = (ultimo.getDay() - diaSemana + 7) % 7;
  return new Date(ano, mes0, ultimo.getDate() - diff);
}

function datasComerciaisDoAno(ano: number): { nome: string; data: Date }[] {
  const blackFriday = lastWeekday(ano, 10, 5); // última sexta de novembro
  const cyberMonday = new Date(blackFriday);
  cyberMonday.setDate(cyberMonday.getDate() + 3);
  return [
    { nome: "Dia do Consumidor", data: new Date(ano, 2, 15) },
    { nome: "Dia das Mães", data: nthWeekday(ano, 4, 0, 2) }, // 2º domingo de maio
    { nome: "Dia dos Namorados", data: new Date(ano, 5, 12) },
    { nome: "Dia dos Pais", data: nthWeekday(ano, 7, 0, 2) }, // 2º domingo de agosto
    { nome: "Dia das Crianças", data: new Date(ano, 9, 12) },
    { nome: "Black Friday", data: blackFriday },
    { nome: "Cyber Monday", data: cyberMonday },
    { nome: "Natal", data: new Date(ano, 11, 25) },
  ];
}

const DATAS_FORTES_LIMITE = 3;

export function proximasDatasComerciais(hoje: Date = new Date()): DataComercial[] {
  const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const candidatas = [...datasComerciaisDoAno(hoje.getFullYear()), ...datasComerciaisDoAno(hoje.getFullYear() + 1)]
    .filter((d) => d.data.getTime() >= hojeZerado.getTime())
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  return candidatas.slice(0, DATAS_FORTES_LIMITE).map((d) => ({
    nome: d.nome,
    data: d.data.toISOString().slice(0, 10),
    dias_restantes: Math.round((d.data.getTime() - hojeZerado.getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

// --- Histórico real de Ads (dado de verdade, não projeção) --------------------------------

export type HistoricoAdsReal = { periodo_dias: number; gasto_total: number; venda_total: number; roas: number | null } | null;

const HISTORICO_ADS_DIAS = 90;

/** Soma real de todas as campanhas de Ads nos últimos `HISTORICO_ADS_DIAS` — usado no painel
 * pra mostrar "nas suas últimas campanhas, o Ads trouxe R$X em vendas" com dado de verdade,
 * em vez de uma estimativa de lucro de promoção futura (decisão 2026-10-17: nunca projetar).
 * `null` quando Ads nunca foi habilitado ou não gastou nada no período — não mostra bloco
 * zerado sem sentido. */
async function buscarHistoricoAdsReal(ctx: MercadoLivreAuthContext): Promise<HistoricoAdsReal> {
  const advertiserId = await mlBuscarAdvertiserId(ctx);
  if (!advertiserId) return null;

  const hoje = new Date();
  const desde = new Date(hoje);
  desde.setDate(desde.getDate() - HISTORICO_ADS_DIAS);

  const campanhas = await mlBuscarCampanhasAdsComMetricas(
    ctx,
    advertiserId,
    "MLB",
    desde.toISOString().slice(0, 10),
    hoje.toISOString().slice(0, 10)
  );
  const gastoTotal = campanhas.reduce((s, c) => s + (c.metrics?.cost ?? 0), 0);
  const vendaTotal = campanhas.reduce((s, c) => s + (c.metrics?.total_amount ?? 0), 0);
  if (gastoTotal === 0 && vendaTotal === 0) return null;

  return {
    periodo_dias: HISTORICO_ADS_DIAS,
    gasto_total: gastoTotal,
    venda_total: vendaTotal,
    roas: gastoTotal > 0 ? vendaTotal / gastoTotal : null,
  };
}

// --- Métrica de valor (B5, 2026-10-17) — vendas reais depois de uma promoção aplicada ----
//
// Dado puramente descritivo, nunca causal: "desde que você aplicou, vendeu X unidades,
// faturou R$Y" — NÃO afirma que a promoção causou a venda (isso exigiria comparar com um
// cenário sem promoção, que não temos como saber). Só o fato real depois da ação.

export type ValorAcaoAdsAvulso = {
  item_id: string;
  aplicado_em: string;
  valor_antes: number | null;
  valor_depois: number | null;
  unidades_vendidas_depois: number;
  faturamento_depois: number;
};

const MAX_ACOES_VALOR_ADS = 10;

async function buscarValorAcoesAdsAvulso(
  assinanteId: string,
  ctx: MercadoLivreAuthContext
): Promise<ValorAcaoAdsAvulso[]> {
  const { data } = await supabaseAdmin
    .from("calculadora_assinante_ai_acoes")
    .select("item_id, valor_antes, valor_depois, criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "ads")
    .eq("tipo_acao", "aplicar_promocao_lote")
    .order("criado_em", { ascending: false })
    .limit(MAX_ACOES_VALOR_ADS);

  type AcaoRow = { item_id: string | null; valor_antes: number | null; valor_depois: number | null; criado_em: string };
  const acoes = ((data ?? []) as AcaoRow[]).filter((a) => a.item_id);
  if (acoes.length === 0) return [];

  const agora = new Date().toISOString();
  return Promise.all(
    acoes.map(async (a) => {
      const resumo = await mlBuscarResumoPedidosPeriodo(ctx, a.criado_em, agora).catch(() => null);
      const item = resumo?.itens.find((i) => i.itemId === a.item_id);
      return {
        item_id: a.item_id as string,
        aplicado_em: a.criado_em,
        valor_antes: a.valor_antes,
        valor_depois: a.valor_depois,
        unidades_vendidas_depois: item?.quantidade ?? 0,
        faturamento_depois: item?.faturamento ?? 0,
      };
    })
  );
}

/** Folga mínima (pontos de margem) pra sugerir subir o % de afiliado — abaixo disso a
 * sugestão seria ruído. Mesmo valor do hub (`AFILIADO_HEADROOM_MINIMO_PCT` em
 * gestorAdsDados.ts), duplicado aqui de propósito (é só um número, não vale importar). */
const AFILIADO_HEADROOM_MINIMO_PCT = 2;
/** Desconto mínimo (pontos percentuais) pra considerar "tem desconto ativo relevante" —
 * mesmo valor do hub (`DESCONTO_ATIVO_MINIMO_PCT`). */
const DESCONTO_ATIVO_MINIMO_PCT = 1;

function classificar(
  margemAtualPct: number,
  prefs: UlissesPreferenciasAvulso
): DiagnosticoAdsAvulso {
  if (margemAtualPct < prefs.margemMinimaPct) return "margem_abaixo_minima";
  if (prefs.margemMaximaPct != null && margemAtualPct > prefs.margemMaximaPct) return "margem_acima_maxima";
  return "margem_saudavel";
}

/** `null` quando ML não conectado OU preferências ainda não configuradas (wizard pendente)
 * OU catálogo vazio — mesmo padrão dos outros gestores avulso. */
export async function montarResultadoAdsAvulso(assinanteId: string): Promise<ResultadoAdsAvulsoEnriquecido | null> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;

  const prefs = await buscarPreferenciasUlissesAvulso(assinanteId);
  if (!prefs) return null;

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const periodoInicio = inicioMes.toISOString().slice(0, 10);
  const periodoFim = hoje.toISOString().slice(0, 10);

  const [grupos, custosPorChave, metricasAds, promocoesAtivas, estoqueRunRes, historicoAdsReal, valorAcoesRecentes] =
    await Promise.all([
      buscarCatalogoAgrupado(ctx),
      buscarCustosUlissesAvulso(assinanteId),
      buscarMetricasAdsPorChave(ctx, "MLB", periodoInicio, periodoFim),
      mlBuscarPromocoesAtivas(ctx),
      supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
        p_assinante_id: assinanteId,
        p_gestor: "estoque",
        p_limit: 1,
      }),
      buscarHistoricoAdsReal(ctx).catch((e) => {
        console.error("[gestorAdsDadosAvulso] histórico real de Ads falhou", e);
        return null;
      }),
      buscarValorAcoesAdsAvulso(assinanteId, ctx).catch((e) => {
        console.error("[gestorAdsDadosAvulso] valor de ações recentes falhou", e);
        return [] as ValorAcaoAdsAvulso[];
      }),
    ]);
  if (grupos.length === 0) return null;

  // Cruzamento com o Estoque avulso (quando já rodou alguma vez) — mesma chave de família
  // (`family_id`/item_id) usada pelos dois gestores, não promove SKU em risco de ruptura sem
  // avisar. `?.resultado` pode vir `null`/ausente em rodada antiga ou sem dado suficiente.
  type EstoqueRunRow = { resultado: { skus?: { chave: string; risco: Risco }[] } | null };
  const estoqueRow = ((estoqueRunRes.data ?? []) as EstoqueRunRow[])[0];
  const riscoRupturaPorChave = new Map<string, Risco>();
  for (const s of estoqueRow?.resultado?.skus ?? []) riscoRupturaPorChave.set(s.chave, s.risco);

  const cupomAtivoNaConta = promocoesAtivas.some((p) => p.type === "SELLER_COUPON_CAMPAIGN");
  const promocoesConta: PromocaoContaResumo[] = promocoesAtivas.map((p) => ({
    tipo: p.type,
    nome: p.name ?? null,
    status: p.status,
    fim: p.finish_date ? p.finish_date.slice(0, 10) : null,
  }));

  // Precisa dos detalhes de novo pro listing_type/shipping/family_id/original_price do
  // representante — buscarCatalogoAgrupado já filtrou, mas não devolve esses campos pra
  // fora (só o necessário pro catálogo simples). Em vez de refazer a chamada, busca aqui,
  // 1x por grupo (igual ao hub).
  const detalhesPorId = new Map(
    (await mlBuscarItensDetalhe(grupos.map((g) => g.itemIdRepresentante), ctx)).map((d) => [d.id, d])
  );

  const skus: SkuResultadoAdsAvulso[] = await Promise.all(
    grupos.map(async (grupo): Promise<SkuResultadoAdsAvulso> => {
      const custo = custosPorChave.get(grupo.chave) ?? null;
      const detalhe = detalhesPorId.get(grupo.itemIdRepresentante);
      const { tipo, comissaoPct } = mlComissaoPorListingType(detalhe?.listing_type_id);

      const chaveAds = detalhe?.family_id != null ? String(detalhe.family_id) : grupo.itemIdRepresentante;
      const metricaAds = metricasAds?.porChave.get(chaveAds);
      const adsGastoMesReal = metricaAds?.cost ?? 0;
      const adsVendasMesReal = metricaAds?.unitsQuantity ?? 0;
      const totalUnidadesVendidasMes = adsVendasMesReal + (metricaAds?.organicUnitsQuantity ?? 0);
      const adsPctReal =
        totalUnidadesVendidasMes > 0 ? (adsGastoMesReal / totalUnidadesVendidasMes / grupo.preco) * 100 : 0;
      const vendaTotalMesReal = (metricaAds?.totalAmount ?? 0) + (metricaAds?.organicUnitsAmount ?? 0);
      const tacosRealPct = vendaTotalMesReal > 0 ? (adsGastoMesReal / vendaTotalMesReal) * 100 : 0;
      const roasReal = adsGastoMesReal > 0 ? (metricaAds?.totalAmount ?? 0) / adsGastoMesReal : 0;

      const precoOriginal = detalhe?.original_price ?? null;
      const descontoAtivoPct =
        precoOriginal != null && precoOriginal > grupo.preco ? ((precoOriginal - grupo.preco) / precoOriginal) * 100 : 0;
      let descontoAtivoTipo: string | null = null;
      let descontoAtivoNome: string | null = null;
      let descontoAtivoFim: string | null = null;
      if (descontoAtivoPct > DESCONTO_ATIVO_MINIMO_PCT && precoOriginal != null) {
        const promosAtivas = await mlBuscarPromocaoAtivaItem(grupo.itemIdRepresentante, ctx);
        const promo = promosAtivas[0];
        descontoAtivoTipo = promo?.type ?? null;
        descontoAtivoNome = promo?.name ?? null;
        descontoAtivoFim = promo?.finish_date?.slice(0, 10) ?? null;
      }

      const membros = grupo.membros.map((m) => ({ item_id: m.itemId, titulo: m.titulo }));
      const riscoRupturaEstoque = riscoRupturaPorChave.get(grupo.chave) ?? null;

      if (custo === null) {
        return {
          chave: grupo.chave,
          item_id_representante: grupo.itemIdRepresentante,
          nome_produto: grupo.nomeProduto,
          preco: grupo.preco,
          custo: null,
          tipo_anuncio: tipo,
          comissao_pct: comissaoPct,
          frete_real: null,
          diagnostico: "sem_custo",
          margem_atual_pct: null,
          margem_minima_pct: prefs.margemMinimaPct,
          margem_maxima_pct: prefs.margemMaximaPct,
          imposto_pct: prefs.impostoPct,
          perda_pct: prefs.perdaPct,
          preco_minimo_seguro: null,
          permalink: detalhe?.permalink ?? null,
          ads_gasto_mes_real: adsGastoMesReal,
          ads_vendas_mes_real: adsVendasMesReal,
          tacos_real_pct: tacosRealPct,
          roas_real: roasReal,
          afiliado_pct_configurado: null,
          afiliado_pct_teto_seguro: null,
          preco_original: precoOriginal,
          desconto_ativo_pct: descontoAtivoPct,
          desconto_ativo_tipo: descontoAtivoTipo,
          desconto_ativo_nome: descontoAtivoNome,
          desconto_ativo_fim: descontoAtivoFim,
          membros,
          risco_ruptura_estoque: riscoRupturaEstoque,
        };
      }

      const freteReal = await mlBuscarCustoRealEnvioParaDestino(grupo.itemIdRepresentante, ctx);
      const margemAtualPct = calcularMargemRealizada({
        precoVenda: grupo.preco,
        custo,
        frete: freteReal ?? 0,
        comissaoPct,
        impostoPct: prefs.impostoPct,
        perdaPct: prefs.perdaPct,
        adsPct: adsPctReal,
        afiliadoPct: prefs.afiliadoAtivo ? (prefs.afiliadoPct ?? 0) : 0,
      });
      // custoOperacionalPorPreco: a API do ML não simula o frete/custo operacional pra um
      // preço candidato hipotético (só devolve o custo real do preço publicado hoje) — usar
      // o valor real fixo em vez de uma tabela de faixa inventada (ex. regra pública do ML
      // de custo variável abaixo de R$79, que pode mudar sem aviso e não é dado da API).
      // Converge na 1ª iteração; a função em margemCalculo.ts já suporta uma tabela real de
      // faixas no futuro, se um dia virar dado confiável.
      const freteRealFixo = freteReal ?? 0;
      const pisoFormal = calcularPrecoPisoFormal({
        custo,
        embalagem: prefs.embalagemBrl,
        custoFull: prefs.custoFullBrl,
        devolucaoTaxaPct: prefs.devolucaoTaxaPct,
        devolucaoCustoBrl: prefs.devolucaoCustoBrl,
        comissaoPct,
        impostoPct: prefs.impostoPct,
        margemMinimaPct: prefs.margemMinimaPct,
        acosAlvoPct: prefs.acosAlvoPct,
        custoOperacionalPorPreco: () => freteRealFixo,
      });
      const precoMinimoSeguro = pisoFormal?.precoPiso ?? null;

      const afiliadoPctConfigurado = prefs.afiliadoAtivo ? (prefs.afiliadoPct ?? 0) : null;
      const headroomAfiliado = margemAtualPct - prefs.margemMinimaPct;
      const afiliadoPctTetoSeguro =
        afiliadoPctConfigurado != null && headroomAfiliado > AFILIADO_HEADROOM_MINIMO_PCT
          ? Math.round((afiliadoPctConfigurado + headroomAfiliado) * 10) / 10
          : null;

      return {
        chave: grupo.chave,
        item_id_representante: grupo.itemIdRepresentante,
        nome_produto: grupo.nomeProduto,
        preco: grupo.preco,
        custo,
        tipo_anuncio: tipo,
        comissao_pct: comissaoPct,
        frete_real: freteReal,
        diagnostico: classificar(margemAtualPct, prefs),
        margem_atual_pct: margemAtualPct,
        margem_minima_pct: prefs.margemMinimaPct,
        margem_maxima_pct: prefs.margemMaximaPct,
        imposto_pct: prefs.impostoPct,
        perda_pct: prefs.perdaPct,
        preco_minimo_seguro: precoMinimoSeguro,
        permalink: detalhe?.permalink ?? null,
        ads_gasto_mes_real: adsGastoMesReal,
        ads_vendas_mes_real: adsVendasMesReal,
        tacos_real_pct: tacosRealPct,
        roas_real: roasReal,
        afiliado_pct_configurado: afiliadoPctConfigurado,
        afiliado_pct_teto_seguro: afiliadoPctTetoSeguro,
        preco_original: precoOriginal,
        desconto_ativo_pct: descontoAtivoPct,
        desconto_ativo_tipo: descontoAtivoTipo,
        desconto_ativo_nome: descontoAtivoNome,
        desconto_ativo_fim: descontoAtivoFim,
        membros,
        risco_ruptura_estoque: riscoRupturaEstoque,
      };
    })
  );

  // Pior caso primeiro — mesmo princípio dos outros gestores.
  skus.sort((a, b) => {
    const pa = a.diagnostico === "sem_custo" ? -1 : (a.margem_atual_pct ?? 0);
    const pb = b.diagnostico === "sem_custo" ? -1 : (b.margem_atual_pct ?? 0);
    return pa - pb;
  });

  const destaqueAtencao = skus.filter((s) => s.diagnostico === "margem_abaixo_minima").map((s) => s.chave);
  const campanhas = classificarCampanhas(metricasAds?.campanhas ?? []).map(campanhaParaJson);

  return {
    skus,
    destaque_atencao: destaqueAtencao,
    ads_gasto_total_mes: metricasAds?.gastoTotalMes ?? null,
    cupom_ativo_na_conta: cupomAtivoNaConta,
    promocoes_conta: promocoesConta,
    campanhas,
    calendario_datas_fortes: proximasDatasComerciais(),
    historico_ads_real: historicoAdsReal,
    valor_acoes_recentes: valorAcoesRecentes,
  };
}
