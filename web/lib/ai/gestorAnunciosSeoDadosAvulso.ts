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
 *   aplicar título/descrição/característica (ver app/api/gestores-ia-avulso/andrey/
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
  mlSugerirCategoria,
  menorLadoFotoMaxSize,
  mlBuscarReclamacoesAbertas,
  mlBuscarPedidoItemPrincipal,
  type MercadoLivreAuthContext,
  type MercadoLivreAtributoCategoria,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
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

/** Resolve reclamação pós-venda em aberto → item_id, mesma técnica já em produção em
 * `gestorDisputasFornecedorDados.ts` (resourceId da reclamação É o order_id). Falha de
 * resolução de 1 reclamação nunca derruba as outras. */
async function resolverReclamacoesAbertasPorItemAvulso(
  ctx: MercadoLivreAuthContext
): Promise<Map<string, string>> {
  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx).catch(() => []);
  const porItem = new Map<string, string>();
  await Promise.all(
    reclamacoes.map(async (r) => {
      const item = await mlBuscarPedidoItemPrincipal(r.resourceId, ctx).catch(() => null);
      if (item && !porItem.has(item.itemId)) porItem.set(item.itemId, r.reasonId);
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
  reclamacoesPorItem: Map<string, string>
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
          diasNoAr: m.diasNoAr,
          vendasTotais: m.sold_quantity,
          visitas30d: await mlBuscarVisitas30d(m.id, ctx),
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
  let perguntaReforcaGap: { pergunta: string; itemId: string; gap: string } | null = null;
  let reclamacaoAbertaCodigo: string | null = null;
  for (const m of membros) {
    if (!perguntaReforcaGap) {
      for (const p of perguntasPorItem.get(m.id) ?? []) {
        const gap = perguntaReforcaAlgumGap(p.pergunta, gapsDoGrupo);
        if (gap) {
          perguntaReforcaGap = { pergunta: p.pergunta, itemId: m.id, gap: gap.name };
          break;
        }
      }
    }
    if (!reclamacaoAbertaCodigo) {
      const codigo = reclamacoesPorItem.get(m.id);
      if (codigo) reclamacaoAbertaCodigo = codigo;
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
    reclamacaoAbertaCodigo,
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

  // Cruzamento com Reputação (perguntas pendentes) e reclamações pós-venda — busca 1x pra
  // conta inteira, não por grupo (evita N chamadas repetidas à API do ML).
  const [perguntas, reclamacoesPorItem] = await Promise.all([
    buscarPerguntasContexto(ctx).catch(() => [] as PerguntaContexto[]),
    resolverReclamacoesAbertasPorItemAvulso(ctx).catch(() => new Map<string, string>()),
  ]);
  const perguntasPorItem = new Map<string, PerguntaContexto[]>();
  for (const p of perguntas) {
    const lista = perguntasPorItem.get(p.itemId) ?? [];
    lista.push(p);
    perguntasPorItem.set(p.itemId, lista);
  }

  const cacheAtributos = new Map<string, MercadoLivreAtributoCategoria[]>();
  const contexto: AnuncioSeoContexto[] = [];
  for (const grupo of grupos) {
    const c = await montarContextoGrupoAvulso(
      grupo.chave,
      grupo.membros,
      ctx,
      cacheAtributos,
      perguntasPorItem,
      reclamacoesPorItem
    );
    contexto.push({ ...c, duplicidade: duplicidadePorChave.get(grupo.chave) ?? null });
  }
  return contexto;
}

/** Monta os params de request da Anthropic pro assinante avulso — mesma config do hub
 * (`montarRequestAnunciosSeo` em gestorRequestBuilders.ts), usada pelo batch submit do cron
 * (gestorAvulsoBatchSubmit.ts, desconto de 50%). O clique manual/BYOK continua chamando
 * `client.messages.create` direto em gestorAvulsoAndreyRodar.ts (precisa de resposta síncrona,
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
  visitas_30d: number;
  dias_no_ar: number;
  fotos_insuficientes: boolean;
  foto_baixa_resolucao: boolean;
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
   * quando nenhuma pergunta pendente bateu com nenhum atributo faltando desse grupo. */
  pergunta_reforca_gap: { texto: string; gap: string } | null;
};

export type ResultadoAnunciosSeoEnriquecidoAvulso = {
  anuncios: AnuncioResultadoEnriquecidoAvulso[];
  destaque_prioridade: string[];
};

export async function enriquecerResultadoAnunciosSeoAvulso(
  assinanteId: string,
  resultadoIA: { anuncios: AnuncioResultadoIA[]; destaque_prioridade: string[] }
): Promise<ResultadoAnunciosSeoEnriquecidoAvulso> {
  const dadosContexto = await buscarDadosAnunciosSeoAvulso(assinanteId);
  const porChave = new Map(dadosContexto.map((d) => [d.chave, d]));

  const anuncios = resultadoIA.anuncios.map((a) => {
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
        ? { texto: grupo.perguntaReforcaGap.pergunta, gap: grupo.perguntaReforcaGap.gap }
        : null,
      membros: (grupo?.membros ?? []).map((m) => ({
        item_id: m.itemId,
        titulo_completo: m.tituloCompleto,
        vendas_totais: m.vendasTotais,
        visitas_30d: m.visitas30d,
        dias_no_ar: m.diasNoAr,
        fotos_insuficientes: m.quantidadeFotos < MIN_FOTOS_RECOMENDADO,
        foto_baixa_resolucao: m.fotoBaixaResolucao,
      })),
    };
  });

  return { anuncios, destaque_prioridade: resultadoIA.destaque_prioridade };
}

export { PROMPT_ANUNCIOS_SEO, SCHEMA_ANUNCIOS_SEO };
