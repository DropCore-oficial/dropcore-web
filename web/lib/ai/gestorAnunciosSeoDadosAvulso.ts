/**
 * Dado real do gestor Andrey (Anúncios & SEO) pro assinante avulso "Gestores de IA" —
 * mesma lógica de julgamento do hub (agrupamento por família, detecção de duplicado, ficha
 * técnica incompleta, categoria provavelmente errada), mas 100% via API do Mercado Livre,
 * sem tocar em nenhuma tabela do hub (`skus`, `seller_mercadolivre_sku_map`,
 * `produto_tabela_medidas`) — isolamento decidido em
 * docs/SCHEMA.md ("Gestores de IA avulso").
 *
 * Diferenças deliberadas vs. `gestorAnunciosSeoDados.ts` (hub):
 * - Guia de tamanhos (`tabelaMedidasFaltando`) sempre `false` — o avulso não tem
 *   `produto_tabela_medidas`, não tem como saber se existe guia pra anexar.
 * - Sem `buscarSkusSemAnuncio` — isso lê `skus`/`seller_skus_habilitados` (catálogo de
 *   fornecedor), que não existe pro avulso.
 * - Sem comparação com ações aplicadas (`seller_ai_acoes`) — o avulso já tem botão de
 *   aplicar título/descrição/característica (ver app/api/gestores-ia-avulso/anuncio/
 *   aplicar-*), só não tem tabela de auditoria ainda pra comparar visita/venda antes vs.
 *   depois da ação (esse "fechamento de loop" é só no hub por enquanto).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarPrompt } from "./gestorPrompts";
import { MODELO_GESTORES_IA } from "./gestorRequestBuilders";
import {
  PROMPT_ANUNCIOS_SEO,
  SCHEMA_ANUNCIOS_SEO,
  agruparPorFamilia,
  detectarDuplicados,
  buscarAtributosFaltando,
  atributosSemReforcoNoTexto,
  grupoFoiCheckadoRecentementeSemMudanca,
  mapaVendasPorChave,
  DIAS_MINIMOS_NO_AR,
  MAX_CANDIDATOS,
  MIN_FOTOS_RECOMENDADO,
  MIN_LADO_FOTO_RECOMENDADO,
  type ItemComDias,
  type AnuncioSeoContexto,
  type AtributoFaltando,
  type AtributoPreenchido,
  type AtributoConflitante,
  type AnuncioResultadoAnteriorMinimo,
  type DuplicidadeAnuncio,
  type UltimaChecagemGrupo,
} from "./gestorAnunciosSeoDados";
import {
  mlBuscarItensAtivos,
  mlBuscarItensDetalhe,
  mlBuscarDescricao,
  mlBuscarVisitas30d,
  mlBuscarVisitasPeriodo,
  mlSugerirCategoria,
  menorLadoFotoMaxSize,
  proporcaoFotoRecomendada,
  mlBuscarReclamacoesAbertas,
  mlResolverItemPrincipalReclamacao,
  mlBuscarMotivoReclamacao,
  mlBuscarResumoPedidosPeriodo,
  type MercadoLivreAuthContext,
  type MercadoLivreAtributoCategoria,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { buscarMetricasAdsPorChave } from "./gestorAdsDados";
import { temOrcamentoDisponivelHoje, type AssinanteByok } from "./gestorAvulsoOrcamento";
import { analisarFotoAnuncioAvulso } from "./gestorDesignFotoAvulso";
import { buscarPerguntasContexto, type PerguntaContexto } from "./gestorReputacaoAtendimentoDados";

/** Normaliza acento/caixa pra comparar texto de pergunta com nome de atributo — "Tamanho" e
 * "tamanho" no meio de uma frase precisam bater. */
function normalizarTextoBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Pergunta real de comprador cruzada com os gaps estruturais já detectados do grupo —
 * correspondência simples por palavra-chave (nome do atributo aparece no texto da pergunta),
 * sem IA nova nessa etapa. Nomes de atributo curtos (≤2 letras) são ignorados pra evitar falso
 * positivo. */
function perguntaReforcaAlgumGap(
  perguntaTexto: string,
  gaps: AtributoFaltando[]
): AtributoFaltando | null {
  const textoNorm = normalizarTextoBusca(perguntaTexto);
  for (const gap of gaps) {
    const nomeNorm = normalizarTextoBusca(gap.name);
    if (nomeNorm.length <= 2) continue;
    if (textoNorm.includes(nomeNorm)) return gap;
  }
  return null;
}

const JANELA_VENDAS_FUNIL_DIAS = 30;

/** Mesmo parse de `ReputacaoTermometro.tsx` (`nivel` cru do ML, formato `"5_green"`/
 * `"3_yellow"`/etc, só o dígito importa) — duplicado aqui de propósito, é só um número, não
 * vale importar de um componente `.tsx` dentro de uma lib de dados. */
function indiceReputacaoAvulso(nivel: string | null): number | null {
  if (!nivel) return null;
  const m = nivel.match(/^(\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 5 ? n : null;
}

/** Shape mínimo da última rodada salva do ADS/SAC avulso — só os campos que o funil do
 * Anúncio precisa ler (`ads_gasto_mes_real` por chave de família, `nivel` de reputação da
 * conta), via a mesma RPC genérica `fn_gestores_ia_avulso_ai_runs_recentes` que o Estoque
 * já usa pra "piorou desde ontem" e o ADS avulso já usa pra cruzar com o Estoque antes de
 * sugerir promoção — cruzamento entre gestores via rodada já salva, zero API nova. */
type AdsRunRow = {
  resultado: { skus?: { chave: string; ads_gasto_mes_real?: number; desconto_ativo_pct?: number }[] } | null;
};
type ReputacaoRunRow = { resultado: { nivel?: string | null } | null };
type EstoqueRunRow = {
  resultado: {
    skus?: { chave: string; variacao_critica?: { nome: string; estoque_atual: number } | null }[];
  } | null;
};

async function buscarUltimaRodadaAdsAvulso(assinanteId: string): Promise<AdsRunRow[]> {
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "ads",
    p_limit: 1,
  });
  return (data ?? []) as AdsRunRow[];
}

async function buscarUltimaRodadaReputacaoAvulso(assinanteId: string): Promise<ReputacaoRunRow[]> {
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "reputacao_atendimento",
    p_limit: 1,
  });
  return (data ?? []) as ReputacaoRunRow[];
}

/** Última rodada do Estoque avulso — mesmo padrão de cruzamento entre gestores já usado
 * pelo ADS avulso (lê a última rodada do Estoque antes de sugerir promoção). Aqui é só pra
 * saber se alguma variação do grupo está marcada como crítica (`variacao_critica`). */
async function buscarUltimaRodadaEstoqueAvulso(assinanteId: string): Promise<EstoqueRunRow[]> {
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "estoque",
    p_limit: 1,
  });
  return (data ?? []) as EstoqueRunRow[];
}

// --- Comparação com ~60-90 dias atrás (preço/tráfego/Ads) — 2026-10-19 --------------------
//
// "Preço fora do mercado" (concorrência) não dá — testado ao vivo 2026-08-20, API do ML não
// expõe isso pra catálogo não catalogado (ver `gestorPrompts.ts`). Preço histórico DA PRÓPRIA
// conta também não tem endpoint retroativo (testado ao vivo 2026-10-19: `/items/{id}/
// price_history` e `/items/{id}/history` dão 404; `/items/{id}/prices` só devolve o preço
// ATUAL + `last_updated`, não uma linha do tempo) — por isso preço só dá pra comparar com o
// que a gente mesmo for salvando a partir de agora (`preco_atual`, ver `HistoricoPrecoProprio`
// abaixo). TRÁFEGO e ADS são diferentes: testado ao vivo 2026-10-19 que os dois endpoints
// aceitam `date_from`/`date_to` pra janela PASSADA de verdade (não só "últimos 30 dias a
// partir de agora") — `mlBuscarVisitasPeriodo` e `buscarMetricasAdsPorChave` já existiam ou
// foram criados pra isso, então a comparação de tráfego/Ads funciona desde já, sem esperar
// a conta acumular rodada própria.

/** Janela de comparação: tráfego/Ads de HOJE (últimos 30d) vs. a mesma largura de janela
 * terminando ~60 dias atrás — "apples to apples", os dois são janelas de 30 dias. */
const DIAS_FIM_JANELA_HISTORICA = 60;
const DIAS_INICIO_JANELA_HISTORICA = 90;

function janelaHistorica(): { de: string; ate: string } {
  const agora = Date.now();
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    de: fmt(agora - DIAS_INICIO_JANELA_HISTORICA * 24 * 60 * 60 * 1000),
    ate: fmt(agora - DIAS_FIM_JANELA_HISTORICA * 24 * 60 * 60 * 1000),
  };
}

/** Tráfego real de cada item nessa janela passada — 1 chamada por item (mesmo padrão de
 * `mlBuscarVisitas30d`), direto na API, sem depender de rodada salva. */
async function buscarVisitasHistoricasPorItem(ids: string[], ctx: MercadoLivreAuthContext): Promise<Map<string, number>> {
  const { de, ate } = janelaHistorica();
  const mapa = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      const visitas = await mlBuscarVisitasPeriodo(id, de, ate, ctx).catch(() => 0);
      mapa.set(id, visitas);
    })
  );
  return mapa;
}

/** Gasto real de Ads por chave nessa janela passada — mesma função que o ADS avulso já usa
 * pro mês corrente (`buscarMetricasAdsPorChave`), só que com a janela histórica em vez do
 * mês atual. `null` quando a conta nunca teve Ads habilitado. */
async function buscarAdsGastoHistoricoPorChave(ctx: MercadoLivreAuthContext): Promise<Map<string, number>> {
  const { de, ate } = janelaHistorica();
  const metricas = await buscarMetricasAdsPorChave(ctx, "MLB", de, ate).catch(() => null);
  const mapa = new Map<string, number>();
  for (const [chave, m] of metricas?.porChave ?? []) mapa.set(chave, m.cost);
  return mapa;
}

type RodadaComData = { resultado: unknown; criado_em: string };

/** Preço só dá pra comparar com o que a própria conta for salvando (sem endpoint retroativo,
 * ver comentário acima) — acha, entre as últimas rodadas salvas do Anúncio, a mais próxima
 * de ~60 dias atrás. `null` enquanto não existir rodada antiga o suficiente (não inventa
 * comparação sem dado de verdade por perto). */
async function buscarHistoricoPrecoProprioAvulso(assinanteId: string): Promise<Map<string, number>> {
  const LIMITE_BUSCA = 180;
  const TOLERANCIA_DIAS = 20;
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "anuncios_seo",
    p_limit: LIMITE_BUSCA,
  });
  const linhas = (data ?? []) as RodadaComData[];
  if (linhas.length === 0) return new Map();

  const alvo = Date.now() - DIAS_FIM_JANELA_HISTORICA * 24 * 60 * 60 * 1000;
  let melhor: RodadaComData | null = null;
  let menorDiferencaMs = Infinity;
  for (const linha of linhas) {
    const diferencaMs = Math.abs(new Date(linha.criado_em).getTime() - alvo);
    if (diferencaMs < menorDiferencaMs) {
      menorDiferencaMs = diferencaMs;
      melhor = linha;
    }
  }
  if (!melhor || menorDiferencaMs / (24 * 60 * 60 * 1000) > TOLERANCIA_DIAS) return new Map();

  const anuncios =
    (melhor.resultado as { anuncios?: Array<{ chave: string; preco_atual?: number }> } | null)?.anuncios ?? [];
  const mapa = new Map<string, number>();
  for (const a of anuncios) if (a.preco_atual !== undefined) mapa.set(a.chave, a.preco_atual);
  return mapa;
}

export type ReclamacaoAbertaInfo = { codigo: string; motivo: string | null; triage: string[] };

/** Resolve reclamação pós-venda em aberto → item_id. `resource` da claim varia por tipo
 * (`order` em mediations/returns, `shipment` em cancel_purchase — confirmado ao vivo
 * 2026-10-17, ver `mlResolverItemPrincipalReclamacao`); usar só `mlBuscarPedidoItemPrincipal`
 * direto no `resourceId` (como era antes) falhava silenciosamente pras claims tipo shipment.
 * Também resolve o motivo humano do `reason_id` via API oficial (`mlBuscarMotivoReclamacao`,
 * 2026-10-17) — antes só passava o código cru pra IA. Falha de resolução de 1 reclamação
 * nunca derruba as outras. */
async function resolverReclamacoesAbertasPorItemAvulso(
  ctx: MercadoLivreAuthContext
): Promise<Map<string, ReclamacaoAbertaInfo>> {
  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx).catch(() => []);
  const porItem = new Map<string, ReclamacaoAbertaInfo>();
  await Promise.all(
    reclamacoes.map(async (r) => {
      const item = await mlResolverItemPrincipalReclamacao(r, ctx).catch(() => null);
      if (!item || porItem.has(item.itemId)) return;
      const info = await mlBuscarMotivoReclamacao(r.reasonId, ctx).catch(() => null);
      porItem.set(item.itemId, { codigo: r.reasonId, motivo: info?.detail ?? null, triage: info?.rulesEngineTriage ?? [] });
    })
  );
  return porItem;
}

async function montarContextoGrupoAvulso(
  chave: string,
  membros: ItemComDias[],
  ctx: MercadoLivreAuthContext,
  cacheAtributos: Map<string, MercadoLivreAtributoCategoria[]>,
  perguntasPorItem: Map<string, PerguntaContexto[]>,
  reclamacoesPorItem: Map<string, ReclamacaoAbertaInfo>,
  historicoPerguntaGap: Map<string, number>,
  vendasReais30dPorItem: Map<string, number>,
  adsGastoMesPorChave: Map<string, number>,
  descontoAtivoPctPorChave: Map<string, number>,
  nivelReputacaoConta: string | null,
  historicoPrecoPorChave: Map<string, number>,
  visitasHistoricasPorItem: Map<string, number>,
  adsGastoHistoricoPorChave: Map<string, number>,
  variacaoCriticaPorChave: Map<string, { nome: string; estoqueAtual: number }>
): Promise<AnuncioSeoContexto> {
  const representante = [...membros].sort((a, b) => b.sold_quantity - a.sold_quantity)[0];

  const [descricao, atributosFaltando, categoriasSugeridas, membrosContexto] = await Promise.all([
    mlBuscarDescricao(representante.id, ctx),
    buscarAtributosFaltando(representante, ctx, cacheAtributos),
    mlSugerirCategoria(representante.title, ctx),
    Promise.all(
      membros.map(async (m) => {
        const ladoCapa = menorLadoFotoMaxSize(m.pictures?.[0]?.max_size);
        return {
          itemId: m.id,
          tituloCompleto: m.title,
          quantidadeFotos: m.pictures?.length ?? 0,
          fotoBaixaResolucao: ladoCapa !== null && ladoCapa < MIN_LADO_FOTO_RECOMENDADO,
          fotoForaDoPadrao: proporcaoFotoRecomendada(m.pictures?.[0]?.max_size) === "fora_do_padrao",
          diasNoAr: m.diasNoAr,
          vendasTotais: m.sold_quantity,
          visitas30d: await mlBuscarVisitas30d(m.id, ctx),
          vendasReais30d: vendasReais30dPorItem.get(m.id) ?? 0,
        };
      })
    ),
  ]);

  const categoriaProvavelmenteErrada =
    categoriasSugeridas.length > 0 && !categoriasSugeridas.some((c) => c.categoryId === representante.category_id);

  const { semReforco: atributosSemReforcoTexto, conflitantes: atributosConflitantes } = atributosSemReforcoNoTexto(
    atributosFaltando.preenchidos,
    `${representante.title} ${descricao}`
  );

  const gapsDoGrupo = [...atributosFaltando.principais, ...atributosFaltando.secundarios];
  let perguntaReforcaGap: { pergunta: string; itemId: string; gap: string; repeticoes: number } | null = null;
  let reclamacaoAberta: ReclamacaoAbertaInfo | null = null;
  for (const m of membros) {
    if (!perguntaReforcaGap) {
      for (const p of perguntasPorItem.get(m.id) ?? []) {
        const gap = perguntaReforcaAlgumGap(p.pergunta, gapsDoGrupo);
        if (gap) {
          perguntaReforcaGap = {
            pergunta: p.pergunta,
            itemId: m.id,
            gap: gap.name,
            repeticoes: historicoPerguntaGap.get(`${chave}|${gap.name}`) ?? 0,
          };
          break;
        }
      }
    }
    if (!reclamacaoAberta) {
      const info = reclamacoesPorItem.get(m.id);
      if (info) reclamacaoAberta = info;
    }
  }

  // Dois funis diferentes, NUNCA misturados (achado real 2026-10-19: Ads é fator de
  // TRÁFEGO — gera visita —, não de CONVERSÃO; colocar "sem Ads" como causa de "teve visita
  // e não vendeu" não faz sentido, só explicaria "tem pouca visita").
  const visitas30dGrupo = membrosContexto.reduce((s, m) => s + m.visitas30d, 0);
  const vendas30dGrupoReal = membrosContexto.reduce((s, m) => s + m.vendasReais30d, 0);
  const precoHistorico = historicoPrecoPorChave.get(chave) ?? null;
  const adsGastoMesAtual = adsGastoMesPorChave.get(chave) ?? 0;
  // Tráfego histórico vem direto da API (janela real ~60-90d atrás), não de rodada salva —
  // ver `buscarVisitasHistoricasPorItem`/comentário no topo do arquivo.
  const visitasHistoricasBruto = membros.reduce((s, m) => s + (visitasHistoricasPorItem.get(m.id) ?? 0), 0);

  // Funil de TRÁFEGO: zero visita real em 30d, OU queda real de pelo menos a metade frente
  // a ~60 dias atrás (comparação com o próprio histórico da conta, não limiar genérico de
  // mercado) — "tinha bastante visita e caiu" conta como "poucas visitas" mesmo que não
  // tenha zerado. Causa só quando o próprio histórico de Ads explica a variação:
  // - tinha Ads ativo há 60 dias e zerou agora → Ads removido explica a queda.
  // - não tinha Ads nem há 60 dias nem agora, mas tinha bastante visita antes e caiu do nada
  //   → não tem causa identificada, mas é candidato a testar Ads (nunca teve).
  const visitasHistoricas = visitasHistoricasBruto > 0 ? visitasHistoricasBruto : null;
  const quedaRealFrenteAoHistorico = visitasHistoricas !== null && visitas30dGrupo < visitasHistoricas * 0.5;
  const visitasBaixasAlerta = visitas30dGrupo === 0 || quedaRealFrenteAoHistorico;

  let visitasBaixasCausaProvavel: AnuncioSeoContexto["visitasBaixasCausaProvavel"] = null;
  let visitasBaixasCausaDetalhe: string | null = null;
  if (visitasBaixasAlerta) {
    const adsGastoHistorico = adsGastoHistoricoPorChave.get(chave) ?? 0;
    if (adsGastoHistorico > 0 && adsGastoMesAtual === 0) {
      visitasBaixasCausaProvavel = "ads_removido";
      visitasBaixasCausaDetalhe = "Esse anúncio tinha investimento em Ads há ~60 dias e não tem mais — provável causa da queda de visita.";
    } else if (adsGastoMesAtual === 0 && visitasHistoricas !== null && visitasHistoricas > 0) {
      visitasBaixasCausaProvavel = "trafego_caiu_sem_causa_aparente";
      visitasBaixasCausaDetalhe = `Tinha ${visitasHistoricas} visitas em 30d há ~60 dias (mesmo sem Ads) e caiu pra ${visitas30dGrupo} agora, sem causa identificada — pode valer testar Ads pra recuperar.`;
    }
  }

  // Funil de CONVERSÃO: teve visita real em 30d, zero venda real no mesmo período. Causa
  // checada na ordem reclamação > reputação > promoção/desconto ativo > preço subiu frente
  // ao próprio histórico > resta foto — para no primeiro achado com dado real, nunca empilha
  // suposição (decisão de produto, ver plano "Funil de conversão no Anúncio"). "Preço fora
  // do mercado" (concorrência) e "cor/numeração sem estoque" ficam de fora por enquanto (ver
  // comentário de `funilCausaProvavel` em `gestorAnunciosSeoDados.ts` pro motivo de cada um).
  const funilAlerta = visitas30dGrupo > 0 && vendas30dGrupoReal === 0;

  let funilCausaProvavel: AnuncioSeoContexto["funilCausaProvavel"] = null;
  let funilCausaDetalhe: string | null = null;
  if (funilAlerta) {
    const indiceReputacao = indiceReputacaoAvulso(nivelReputacaoConta);
    const descontoAtivoPct = descontoAtivoPctPorChave.get(chave) ?? 0;
    // "Subiu de verdade" exige margem real (10%), não qualquer centavo de diferença — número
    // é sensibilidade de UX (quando vale a pena mostrar), não dado externo inventado.
    const precoSubiuSignificativo =
      precoHistorico !== null && precoHistorico > 0 && representante.price > precoHistorico * 1.1;
    if (reclamacaoAberta) {
      funilCausaProvavel = "reclamacao";
      funilCausaDetalhe = reclamacaoAberta.motivo ?? "Reclamação em aberto sobre o produto.";
    } else if (indiceReputacao !== null && indiceReputacao <= 3) {
      funilCausaProvavel = "reputacao_baixa";
      funilCausaDetalhe = `Reputação da conta no nível ${indiceReputacao}/5 — pode estar afetando a confiança de quem visita esse anúncio.`;
    } else if (descontoAtivoPct === 0) {
      funilCausaProvavel = "sem_promocao";
      funilCausaDetalhe = "Esse anúncio não está com nenhuma promoção/desconto ativo agora.";
    } else if (precoSubiuSignificativo) {
      funilCausaProvavel = "preco_subiu";
      funilCausaDetalhe = `Preço subiu de R$ ${precoHistorico!.toFixed(2)} (há ~60 dias) pra R$ ${representante.price.toFixed(2)} — pode estar afastando quem comprava por esse valor.`;
    } else if (variacaoCriticaPorChave.has(chave)) {
      const variacaoCritica = variacaoCriticaPorChave.get(chave)!;
      funilCausaProvavel = "variacao_sem_estoque";
      funilCausaDetalhe =
        variacaoCritica.estoqueAtual <= 0
          ? `A variação "${variacaoCritica.nome}" é a que mais vende desse anúncio e já esgotou — o anúncio inteiro parece saudável, mas essa opção específica não. Repor estoque dela tende a trazer a venda de volta.`
          : `A variação "${variacaoCritica.nome}" é a que mais vende desse anúncio e está acabando — vale repor antes que esgote de verdade.`;
    } else {
      // Resolvido depois, em `enriquecerResultadoAnunciosSeoAvulso` (só ali existe o
      // `diagnostico` de texto da IA e dá pra chamar a Laura) — ver comentário do campo em
      // `gestorAnunciosSeoDados.ts`.
      funilCausaProvavel = "pendente_resolver";
      funilCausaDetalhe =
        "Nenhuma causa objetiva encontrada em reclamação, reputação, promoção, preço ou variação — falta checar texto e foto.";
    }
  }

  return {
    chave,
    itemIdRepresentante: representante.id,
    familiaNome: representante.family_name ?? null,
    tituloExemplo: representante.title,
    descricaoResumo: descricao.slice(0, 400),
    preco: representante.price,
    atributosPrincipaisFaltando: atributosFaltando.principais,
    atributosSecundariosFaltando: atributosFaltando.secundarios,
    // Avulso não tem produto_tabela_medidas do hub — sem como saber se falta guia anexado.
    tabelaMedidasFaltando: false,
    categoriaProvavelmenteErrada,
    categoriaSugeridaNome: categoriaProvavelmenteErrada ? (categoriasSugeridas[0]?.categoryName ?? null) : null,
    duplicidade: null,
    atributosSemReforcoTexto,
    atributosConflitantes,
    membros: membrosContexto,
    perguntaReforcaGap,
    reclamacaoAbertaCodigo: reclamacaoAberta?.codigo ?? null,
    reclamacaoAbertaMotivo: reclamacaoAberta?.motivo ?? null,
    reclamacaoAbertaTriage: reclamacaoAberta?.triage ?? [],
    funilAlerta,
    funilCausaProvavel,
    funilCausaDetalhe,
    visitasBaixasAlerta,
    visitasBaixasCausaProvavel,
    visitasBaixasCausaDetalhe,
    representanteFotos: (representante.pictures ?? [])
      .filter((p): p is { id: string; max_size?: string; secure_url: string } => Boolean(p.secure_url))
      .map((p) => ({ id: p.id, url: p.secure_url })),
  };
}

export async function buscarDadosAnunciosSeoAvulso(assinanteId: string): Promise<AnuncioSeoContexto[]> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return [];

  const ids = await mlBuscarItensAtivos(ctx, 100);
  if (ids.length === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(ids, ctx);
  const agora = Date.now();
  const elegiveis: ItemComDias[] = detalhes
    .map((d) => ({ ...d, diasNoAr: Math.floor((agora - new Date(d.start_time).getTime()) / (1000 * 60 * 60 * 24)) }))
    .filter((d) => d.diasNoAr >= DIAS_MINIMOS_NO_AR);

  const todosGrupos = agruparPorFamilia(elegiveis).map((g) => ({
    ...g,
    vendasTotalGrupo: g.membros.reduce((s, m) => s + m.sold_quantity, 0),
  }));

  const duplicidadePorChave = detectarDuplicados(todosGrupos);

  const { data: rowsRecentes } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("resultado, criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "anuncios_seo")
    .eq("status", "ok")
    .order("criado_em", { ascending: false })
    .limit(5);
  // "Ideias pra produto novo" grava linha nesse mesmo gestor só pra contar no orçamento
  // diário (resultado.tipo === "ideias_produto_novo") — não é diagnóstico, pula pra achar a
  // última rodada real.
  const ultimaRow = (rowsRecentes ?? []).find(
    (r) => (r.resultado as { tipo?: string } | null)?.tipo !== "ideias_produto_novo"
  );
  const ultimaChecagemPorChave =
    ultimaRow?.resultado && ultimaRow.criado_em
      ? mapaVendasPorChave(
          (ultimaRow.resultado as { anuncios?: AnuncioResultadoAnteriorMinimo[] }).anuncios ?? [],
          ultimaRow.criado_em
        )
      : new Map<string, UltimaChecagemGrupo>();

  // Não gasta IA de novo com grupo que já foi checado há pouco e nem vendeu nada desde
  // então — se tudo estiver nessa situação, a lista fica vazia de propósito.
  const candidatosComMudanca = todosGrupos.filter(
    (g) => !grupoFoiCheckadoRecentementeSemMudanca(g.vendasTotalGrupo, ultimaChecagemPorChave.get(g.chave))
  );

  const grupos = [...candidatosComMudanca].sort((a, b) => a.vendasTotalGrupo - b.vendasTotalGrupo).slice(0, MAX_CANDIDATOS);

  // Cruzamento com Reputação (perguntas pendentes), reclamações pós-venda, histórico de
  // "pergunta repetida" e funil visita→venda (venda real 30d + última rodada do SAC/ADS já
  // salva, sem chamada de API nova pros dois últimos) — busca 1x pra conta inteira, não por
  // grupo (evita N chamadas repetidas à API do ML / ao banco).
  const agoraFunil = new Date();
  const desdeFunil = new Date(agoraFunil.getTime() - JANELA_VENDAS_FUNIL_DIAS * 24 * 60 * 60 * 1000);
  const idsCandidatos = grupos.flatMap((g) => g.membros.map((m) => m.id));
  const [
    perguntas,
    reclamacoesPorItem,
    historicoPerguntaGap,
    resumoPedidosFunil,
    adsRunRows,
    reputacaoRunRows,
    historicoPrecoPorChave,
    visitasHistoricasPorItem,
    adsGastoHistoricoPorChave,
    estoqueRunRows,
  ] = await Promise.all([
    buscarPerguntasContexto(ctx).catch(() => [] as PerguntaContexto[]),
    resolverReclamacoesAbertasPorItemAvulso(ctx).catch(() => new Map<string, ReclamacaoAbertaInfo>()),
    buscarHistoricoPerguntaGapAvulso(assinanteId).catch(() => new Map<string, number>()),
    mlBuscarResumoPedidosPeriodo(ctx, desdeFunil.toISOString(), agoraFunil.toISOString()).catch(() => ({
      itens: [] as { itemId: string; quantidade: number }[],
    })),
    buscarUltimaRodadaAdsAvulso(assinanteId),
    buscarUltimaRodadaReputacaoAvulso(assinanteId),
    buscarHistoricoPrecoProprioAvulso(assinanteId).catch(() => new Map<string, number>()),
    buscarVisitasHistoricasPorItem(idsCandidatos, ctx).catch(() => new Map<string, number>()),
    buscarAdsGastoHistoricoPorChave(ctx).catch(() => new Map<string, number>()),
    buscarUltimaRodadaEstoqueAvulso(assinanteId),
  ]);
  const perguntasPorItem = new Map<string, PerguntaContexto[]>();
  for (const p of perguntas) {
    const lista = perguntasPorItem.get(p.itemId) ?? [];
    lista.push(p);
    perguntasPorItem.set(p.itemId, lista);
  }
  const vendasReais30dPorItem = new Map<string, number>(resumoPedidosFunil.itens.map((i) => [i.itemId, i.quantidade]));
  const adsSkusUltimaRodada = adsRunRows[0]?.resultado?.skus ?? [];
  const adsGastoMesPorChave = new Map<string, number>(adsSkusUltimaRodada.map((s) => [s.chave, s.ads_gasto_mes_real ?? 0]));
  const descontoAtivoPctPorChave = new Map<string, number>(
    adsSkusUltimaRodada.map((s) => [s.chave, s.desconto_ativo_pct ?? 0])
  );
  const nivelReputacaoConta = reputacaoRunRows[0]?.resultado?.nivel ?? null;
  const variacaoCriticaPorChave = new Map<string, { nome: string; estoqueAtual: number }>(
    (estoqueRunRows[0]?.resultado?.skus ?? [])
      .filter((s) => s.variacao_critica)
      .map((s) => [s.chave, { nome: s.variacao_critica!.nome, estoqueAtual: s.variacao_critica!.estoque_atual }])
  );

  const cacheAtributos = new Map<string, MercadoLivreAtributoCategoria[]>();
  const contexto: AnuncioSeoContexto[] = [];
  for (const grupo of grupos) {
    const c = await montarContextoGrupoAvulso(
      grupo.chave,
      grupo.membros,
      ctx,
      cacheAtributos,
      perguntasPorItem,
      reclamacoesPorItem,
      historicoPerguntaGap,
      vendasReais30dPorItem,
      adsGastoMesPorChave,
      descontoAtivoPctPorChave,
      nivelReputacaoConta,
      historicoPrecoPorChave,
      visitasHistoricasPorItem,
      adsGastoHistoricoPorChave,
      variacaoCriticaPorChave
    );
    contexto.push({ ...c, duplicidade: duplicidadePorChave.get(grupo.chave) ?? null });
  }
  return contexto;
}

/** Monta os params de request da Anthropic pro assinante avulso — mesma config do hub
 * (`montarRequestAnunciosSeo` em gestorRequestBuilders.ts), usada pelo batch submit do cron
 * (gestorAvulsoBatchSubmit.ts, desconto de 50%). O clique manual/BYOK continua chamando
 * `client.messages.create` direto em gestorAvulsoAnuncioRodar.ts (precisa de resposta síncrona,
 * Batch API não serve pra isso). */
export async function montarRequestAnunciosSeoAvulso(
  assinanteId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dados = await buscarDadosAnunciosSeoAvulso(assinanteId);
  if (dados.length === 0) return null;
  return {
    model: MODELO_GESTORES_IA,
    max_tokens: 16384,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, dados) }],
  };
}

// --- Enriquecimento pós-IA (código puro, não pedido pro modelo) -----------------------

type Diagnostico = "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";

type CaracteristicaSugeridaIA = { atributo_id: string; valor: string };

type AnuncioResultadoIA = {
  chave: string;
  diagnostico: Diagnostico;
  titulo_sugerido: string;
  descricao_sugerida: string;
  caracteristicas_sugeridas: CaracteristicaSugeridaIA[];
  observacao: string;
};

export type MembroResultadoEnriquecidoAvulso = {
  item_id: string;
  titulo_completo: string;
  vendas_totais: number;
  /** Venda real dos últimos 30 dias — diferente de `vendas_totais` (lifetime), ver
   * `vendasReais30d` em `gestorAnunciosSeoDados.ts`. */
  vendas_30d: number;
  visitas_30d: number;
  dias_no_ar: number;
  fotos_insuficientes: boolean;
  foto_baixa_resolucao: boolean;
  foto_fora_do_padrao: boolean;
};

export type CaracteristicaSugeridaEnriquecidaAvulso = {
  atributo_id: string;
  atributo_nome: string;
  valor: string;
  valorValido: boolean;
};

export type AnuncioResultadoEnriquecidoAvulso = Omit<AnuncioResultadoIA, "caracteristicas_sugeridas"> & {
  item_id_representante: string;
  familia_nome: string | null;
  atributos_principais_faltando: string[];
  atributos_secundarios_faltando: string[];
  caracteristicas_sugeridas: CaracteristicaSugeridaEnriquecidaAvulso[];
  membros: MembroResultadoEnriquecidoAvulso[];
  categoria_provavelmente_errada: boolean;
  categoria_sugerida_nome: string | null;
  duplicidade: DuplicidadeAnuncio | null;
  atributos_sem_reforco_texto: AtributoPreenchido[];
  atributos_conflitantes: AtributoConflitante[];
  /** Pergunta real de comprador pendente que reforça um gap estrutural já detectado — `null`
   * quando nenhuma pergunta pendente bateu com nenhum atributo faltando desse grupo.
   * `repeticoes` conta em quantas das últimas `JANELA_HISTORICO_PERGUNTA_REPETIDA` rodadas
   * salvas esse MESMO gap já reforçou pergunta pra esse MESMO grupo — reforça urgência
   * (não é só "perguntaram uma vez", é "perguntam disso toda hora"), sem API nova, só
   * agregação do que já tá salvo em `calculadora_assinante_ai_runs`. */
  pergunta_reforca_gap: { texto: string; gap: string; repeticoes: number } | null;
  /** Funil de CONVERSÃO (2026-10-18) — `true` quando o grupo teve visita real nos últimos
   * 30 dias e zero venda real no mesmo período. Ver `funilAlerta` em
   * `gestorAnunciosSeoDados.ts` pra definição completa do sinal e da cascata de causa. */
  funil_alerta: boolean;
  /** `"texto_fraco"`/`"foto_ruim"`/`"sem_causa_identificada"` são resolvidos em
   * `enriquecerResultadoAnunciosSeoAvulso`, depois da IA responder — nunca aparece
   * `"pendente_resolver"` aqui (sentinela interno, ver `gestorAnunciosSeoDados.ts`). */
  funil_causa_provavel:
    | "reclamacao"
    | "reputacao_baixa"
    | "sem_promocao"
    | "preco_subiu"
    | "variacao_sem_estoque"
    | "texto_fraco"
    | "foto_ruim"
    | "sem_causa_identificada"
    | null;
  funil_causa_detalhe: string | null;
  /** Diagnóstico da Laura (gestor Design) — `null` até o funil chegar no último passo
   * (reclamação/reputação/promoção/preço/variação/texto todos descartados) E a Laura
   * conseguir rodar (orçamento disponível). `picture_ids` é o que permite cachear: só
   * reanalisa se o conjunto de fotos mudou desde a última vez. */
  foto_diagnostico: { veredito: "boa" | "ruim"; motivo: string; picture_ids: string[] } | null;
  /** Funil de TRÁFEGO (2026-10-19) — `true` quando o grupo teve ZERO visita real nos
   * últimos 30 dias, ou queda de pelo menos a metade frente a ~60 dias atrás. Problema
   * diferente do funil de conversão acima. */
  visitas_baixas_alerta: boolean;
  visitas_baixas_causa_provavel: "ads_removido" | "trafego_caiu_sem_causa_aparente" | null;
  visitas_baixas_causa_detalhe: string | null;
  /** Preço atual do representante do grupo — persistido aqui (não existia antes) pra rodada
   * futura conseguir comparar "subiu desde quando vendia" sem precisar de API nova, só ler a
   * própria rodada salva de ~60 dias atrás (ver `buscarHistoricoAnuncioProprioAvulso`). */
  preco_atual: number;
};

export type ResultadoAnunciosSeoEnriquecidoAvulso = {
  anuncios: AnuncioResultadoEnriquecidoAvulso[];
  destaque_prioridade: string[];
};

const JANELA_HISTORICO_PERGUNTA_REPETIDA = 10;

type RunHistoricoAnuncioRow = {
  resultado: { anuncios?: Array<{ chave: string; pergunta_reforca_gap?: { gap: string } | null }> } | null;
};

/** Conta, por `chave|gap`, em quantas das últimas rodadas salvas esse gap já reforçou
 * pergunta pra esse grupo — 1 busca só pra conta inteira, não por grupo. */
async function buscarHistoricoPerguntaGapAvulso(assinanteId: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("resultado")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "anuncios_seo")
    .eq("status", "ok")
    .order("criado_em", { ascending: false })
    .limit(JANELA_HISTORICO_PERGUNTA_REPETIDA);

  const contagem = new Map<string, number>();
  for (const row of (data ?? []) as RunHistoricoAnuncioRow[]) {
    for (const a of row.resultado?.anuncios ?? []) {
      const gap = a.pergunta_reforca_gap?.gap;
      if (!gap) continue;
      const chaveComposta = `${a.chave}|${gap}`;
      contagem.set(chaveComposta, (contagem.get(chaveComposta) ?? 0) + 1);
    }
  }
  return contagem;
}

type FotoDiagnosticoCache = { veredito: "boa" | "ruim"; motivo: string; pictureIds: string[] };
type RunFotoDiagnosticoRow = {
  resultado: { anuncios?: Array<{ chave: string; foto_diagnostico?: FotoDiagnosticoCacheJson | null }> } | null;
};
type FotoDiagnosticoCacheJson = { veredito: "boa" | "ruim"; motivo: string; picture_ids: string[] };

/** Último diagnóstico de foto salvo por chave — permite não gastar de novo com a Laura
 * quando o conjunto de fotos do anúncio não mudou desde a última análise. */
async function buscarUltimoFotoDiagnosticoPorChave(assinanteId: string): Promise<Map<string, FotoDiagnosticoCache>> {
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "anuncios_seo",
    p_limit: 1,
  });
  const row = ((data ?? []) as RunFotoDiagnosticoRow[])[0];
  const mapa = new Map<string, FotoDiagnosticoCache>();
  for (const a of row?.resultado?.anuncios ?? []) {
    if (a.foto_diagnostico) {
      mapa.set(a.chave, {
        veredito: a.foto_diagnostico.veredito,
        motivo: a.foto_diagnostico.motivo,
        pictureIds: a.foto_diagnostico.picture_ids,
      });
    }
  }
  return mapa;
}

function mesmoConjuntoDeFotos(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

export async function enriquecerResultadoAnunciosSeoAvulso(
  assinanteId: string,
  resultadoIA: { anuncios: AnuncioResultadoIA[]; destaque_prioridade: string[] },
  opcoesLaura?: {
    apiKey: string;
    assinanteByok: AssinanteByok;
    /** Mutado por referência — quem chama lê depois pra somar no `tokens_input`/`tokens_output`
     * da rodada do Anúncio (mesmo pote de orçamento diário, nunca gasto invisível). */
    acumuladorTokens: { input: number; output: number };
  }
): Promise<ResultadoAnunciosSeoEnriquecidoAvulso> {
  // `repeticoes` já vem calculado dentro de cada `grupo.perguntaReforcaGap`
  // (buscarDadosAnunciosSeoAvulso → montarContextoGrupoAvulso), não precisa buscar de novo.
  const [dadosContexto, fotoDiagnosticoAnteriorPorChave] = await Promise.all([
    buscarDadosAnunciosSeoAvulso(assinanteId),
    buscarUltimoFotoDiagnosticoPorChave(assinanteId),
  ]);
  const porChave = new Map(dadosContexto.map((d) => [d.chave, d]));

  const anuncios = await Promise.all(resultadoIA.anuncios.map(async (a) => {
    const grupo = porChave.get(a.chave);
    const atributosDoGrupo = new Map<string, AtributoFaltando>(
      [...(grupo?.atributosPrincipaisFaltando ?? []), ...(grupo?.atributosSecundariosFaltando ?? [])].map((at) => [
        at.id,
        at,
      ])
    );
    const caracteristicasSugeridas: CaracteristicaSugeridaEnriquecidaAvulso[] = (a.caracteristicas_sugeridas ?? [])
      .map((c) => {
        const atributo = atributosDoGrupo.get(c.atributo_id);
        if (!atributo) return null;
        const valorValido = atributo.valueType !== "list" || atributo.valoresPermitidos.includes(c.valor);
        return { atributo_id: c.atributo_id, atributo_nome: atributo.name, valor: c.valor, valorValido };
      })
      .filter((c): c is CaracteristicaSugeridaEnriquecidaAvulso => c !== null);

    // Resolve o sentinela "pendente_resolver" (ver comentário do campo em
    // `gestorAnunciosSeoDados.ts`): só agora existe `a.diagnostico` (texto, já calculado pela
    // IA) e só agora dá pra chamar a Laura — a cascata de causa checável por código (passos
    // 1-5) já rodou antes e fica como está.
    let funilCausaProvavel: AnuncioResultadoEnriquecidoAvulso["funil_causa_provavel"] | "pendente_resolver" =
      grupo?.funilCausaProvavel ?? null;
    let funilCausaDetalhe = grupo?.funilCausaDetalhe ?? null;
    let fotoDiagnostico: AnuncioResultadoEnriquecidoAvulso["foto_diagnostico"] = null;

    if (funilCausaProvavel === "pendente_resolver") {
      if (a.diagnostico !== "sem_problema_aparente") {
        funilCausaProvavel = "texto_fraco";
        funilCausaDetalhe = "A causa mais provável é o problema de texto já identificado acima.";
      } else {
        const fotos = grupo?.representanteFotos ?? [];
        const pictureIds = fotos.map((f) => f.id);
        const cacheAnterior = fotoDiagnosticoAnteriorPorChave.get(a.chave);
        const fotosNaoMudaram = cacheAnterior && mesmoConjuntoDeFotos(cacheAnterior.pictureIds, pictureIds);

        if (fotosNaoMudaram) {
          fotoDiagnostico = { veredito: cacheAnterior!.veredito, motivo: cacheAnterior!.motivo, picture_ids: pictureIds };
        } else if (
          opcoesLaura &&
          fotos.length > 0 &&
          (await temOrcamentoDisponivelHoje(opcoesLaura.assinanteByok, assinanteId))
        ) {
          const analise = await analisarFotoAnuncioAvulso(
            fotos.map((f) => f.url),
            opcoesLaura.apiKey
          );
          if (analise) {
            fotoDiagnostico = { veredito: analise.veredito, motivo: analise.motivo, picture_ids: pictureIds };
            opcoesLaura.acumuladorTokens.input += analise.tokensInput;
            opcoesLaura.acumuladorTokens.output += analise.tokensOutput;
          }
        }

        if (fotoDiagnostico) {
          funilCausaProvavel = fotoDiagnostico.veredito === "ruim" ? "foto_ruim" : "sem_causa_identificada";
          funilCausaDetalhe =
            fotoDiagnostico.veredito === "ruim"
              ? `O Design analisou a foto e encontrou um problema: ${fotoDiagnostico.motivo}`
              : `Reclamação, reputação, promoção, preço, variação, texto e foto já foram checados e nenhum explica isso. A foto está adequada: ${fotoDiagnostico.motivo}`;
        } else {
          funilCausaProvavel = "sem_causa_identificada";
          funilCausaDetalhe = "Nenhuma causa objetiva encontrada ainda.";
        }
      }
    }

    return {
      ...a,
      item_id_representante: grupo?.itemIdRepresentante ?? a.chave,
      familia_nome: grupo?.familiaNome ?? null,
      atributos_principais_faltando: (grupo?.atributosPrincipaisFaltando ?? []).map((at) => at.name),
      atributos_secundarios_faltando: (grupo?.atributosSecundariosFaltando ?? []).map((at) => at.name),
      caracteristicas_sugeridas: caracteristicasSugeridas,
      categoria_provavelmente_errada: grupo?.categoriaProvavelmenteErrada ?? false,
      categoria_sugerida_nome: grupo?.categoriaSugeridaNome ?? null,
      duplicidade: grupo?.duplicidade ?? null,
      atributos_sem_reforco_texto: grupo?.atributosSemReforcoTexto ?? [],
      atributos_conflitantes: grupo?.atributosConflitantes ?? [],
      pergunta_reforca_gap: grupo?.perguntaReforcaGap
        ? {
            texto: grupo.perguntaReforcaGap.pergunta,
            gap: grupo.perguntaReforcaGap.gap,
            repeticoes: grupo.perguntaReforcaGap.repeticoes,
          }
        : null,
      funil_alerta: grupo?.funilAlerta ?? false,
      funil_causa_provavel: funilCausaProvavel,
      funil_causa_detalhe: funilCausaDetalhe,
      foto_diagnostico: fotoDiagnostico,
      visitas_baixas_alerta: grupo?.visitasBaixasAlerta ?? false,
      visitas_baixas_causa_provavel: grupo?.visitasBaixasCausaProvavel ?? null,
      visitas_baixas_causa_detalhe: grupo?.visitasBaixasCausaDetalhe ?? null,
      preco_atual: grupo?.preco ?? 0,
      membros: (grupo?.membros ?? []).map((m) => ({
        item_id: m.itemId,
        titulo_completo: m.tituloCompleto,
        vendas_totais: m.vendasTotais,
        vendas_30d: m.vendasReais30d ?? 0,
        visitas_30d: m.visitas30d,
        dias_no_ar: m.diasNoAr,
        fotos_insuficientes: m.quantidadeFotos < MIN_FOTOS_RECOMENDADO,
        foto_baixa_resolucao: m.fotoBaixaResolucao,
        foto_fora_do_padrao: m.fotoForaDoPadrao,
      })),
    };
  }));

  return { anuncios, destaque_prioridade: resultadoIA.destaque_prioridade };
}

export { PROMPT_ANUNCIOS_SEO, SCHEMA_ANUNCIOS_SEO };
