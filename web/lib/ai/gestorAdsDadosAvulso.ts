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
import { calcularMargemRealizada } from "@/lib/margemCalculo";
import {
  calcularPrecoMinimoSeguro,
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
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

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
  desconto_ativo_nome: string | null;
  desconto_ativo_fim: string | null;
};

export type ResultadoAdsAvulsoEnriquecido = {
  skus: SkuResultadoAdsAvulso[];
  destaque_atencao: string[];
  ads_gasto_total_mes: number | null;
  cupom_ativo_na_conta: boolean;
  promocoes_conta_resumo: string;
  campanhas: ReturnType<typeof campanhaParaJson>[];
};

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

  const [grupos, custosPorChave, metricasAds, promocoesAtivas] = await Promise.all([
    buscarCatalogoAgrupado(ctx),
    buscarCustosUlissesAvulso(assinanteId),
    buscarMetricasAdsPorChave(ctx, "MLB", periodoInicio, periodoFim),
    mlBuscarPromocoesAtivas(ctx),
  ]);
  if (grupos.length === 0) return null;

  const cupomAtivoNaConta = promocoesAtivas.some((p) => p.type === "SELLER_COUPON_CAMPAIGN");
  const promocoesContaResumo =
    promocoesAtivas.length === 0
      ? "Nenhuma promoção/campanha ativa na conta no momento."
      : promocoesAtivas
          .map((p) => `${p.type}${p.name ? ` "${p.name}"` : ""} (status ${p.status}${p.finish_date ? `, até ${p.finish_date.slice(0, 10)}` : ""})`)
          .join("; ");

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
      let descontoAtivoNome: string | null = null;
      let descontoAtivoFim: string | null = null;
      if (descontoAtivoPct > DESCONTO_ATIVO_MINIMO_PCT && precoOriginal != null) {
        const promosAtivas = await mlBuscarPromocaoAtivaItem(grupo.itemIdRepresentante, ctx);
        const promo = promosAtivas[0];
        descontoAtivoNome = promo ? `${promo.type}${promo.name ? ` "${promo.name}"` : ""}` : null;
        descontoAtivoFim = promo?.finish_date?.slice(0, 10) ?? null;
      }

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
          desconto_ativo_nome: descontoAtivoNome,
          desconto_ativo_fim: descontoAtivoFim,
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
      const precoMinimoSeguro = calcularPrecoMinimoSeguro(
        custo + (freteReal ?? 0),
        comissaoPct,
        prefs.impostoPct,
        prefs.perdaPct,
        prefs.margemMinimaPct
      );

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
        desconto_ativo_nome: descontoAtivoNome,
        desconto_ativo_fim: descontoAtivoFim,
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
    promocoes_conta_resumo: promocoesContaResumo,
    campanhas,
  };
}
