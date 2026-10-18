/**
 * Dado real do gestor Amanda (Reputação & Atendimento) pro assinante avulso "Gestores de IA"
 * — mesma lógica de julgamento do hub (classificação saudável/atenção/crítica, resposta a
 * pergunta pendente via IA), 100% via API do Mercado Livre, sem tocar em nenhuma tabela do
 * hub — isolamento decidido em docs/SCHEMA.md ("Gestores de IA avulso").
 *
 * Diferença deliberada vs. `gestorReputacaoAtendimentoDados.ts` (hub): sem cruzamento com
 * atraso de postagem do fornecedor (`pedido_eventos`/`fornecedores`) — o avulso não tem
 * fornecedor vinculado, essa sinergia (ver o comentário no topo do arquivo do hub) é
 * exclusiva de quem usa o hub completo. `fornecedoresAtraso` fica sempre `[]`.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buscarPerguntasContexto,
  classificarReputacao,
  calcularMargemReputacaoMl,
  responderPerguntasComIA,
  type ReputacaoAtendimentoContexto,
  type PerguntaResultadoEnriquecido,
  type ResultadoReputacaoAtendimentoEnriquecido,
  type ResultadoReputacaoComUso,
  type UsoAnthropicGestor,
  type TendenciaMetrica,
  type TendenciaReputacao,
  type RankingSkuReclamacao,
} from "./gestorReputacaoAtendimentoDados";
import {
  mlBuscarReputacao,
  mlBuscarReclamacoesAbertas,
  mlResolverItemPrincipalReclamacao,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

const MAX_RECLAMACOES_RANKING = 15;
const MAX_ITENS_RANKING = 5;

/** Top 5 SKU/anúncio com mais reclamação aberta — resolve pedido→item pra cada reclamação
 * (1 chamada a mais por reclamação; conta de teste real teve só 3 abertas, custo baixo).
 * Reclamação que não resolve (resource desconhecido, item apagado etc.) é ignorada, não
 * derruba o ranking inteiro. */
export async function buscarRankingSkuReclamacoesAvulso(ctx: MercadoLivreAuthContext): Promise<RankingSkuReclamacao[]> {
  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx, MAX_RECLAMACOES_RANKING);
  if (reclamacoes.length === 0) return [];

  const porItem = new Map<string, RankingSkuReclamacao>();
  for (const r of reclamacoes) {
    const item = await mlResolverItemPrincipalReclamacao(r, ctx).catch(() => null);
    if (!item) continue;
    const atual = porItem.get(item.itemId) ?? { itemId: item.itemId, titulo: item.titulo, qtd: 0, reasonIds: [] };
    atual.qtd += 1;
    atual.reasonIds.push(r.reasonId);
    porItem.set(item.itemId, atual);
  }

  return Array.from(porItem.values())
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, MAX_ITENS_RANKING);
}

const MIN_PONTOS_TENDENCIA = 2;
const JANELA_HISTORICO_RODADAS_TENDENCIA = 30;
/** Variação relativa abaixo disso em 30 dias é "estável", não "subindo"/"caindo" — evita
 * rotular ruído estatístico como tendência real. */
const VARIACAO_RELATIVA_ESTAVEL = 0.1;

type PontoHistorico = { diasAtras: number; valor: number };

/** Regressão linear simples (mínimos quadrados), y = a + b·x — `diasAtras` é 0 na rodada
 * mais recente e negativo no passado, então projetar em x=+7/+30 dá o futuro. */
function regressaoLinear(pontos: PontoHistorico[]): { a: number; b: number } | null {
  const n = pontos.length;
  if (n < MIN_PONTOS_TENDENCIA) return null;
  const somaX = pontos.reduce((s, p) => s + p.diasAtras, 0);
  const somaY = pontos.reduce((s, p) => s + p.valor, 0);
  const somaXY = pontos.reduce((s, p) => s + p.diasAtras * p.valor, 0);
  const somaXX = pontos.reduce((s, p) => s + p.diasAtras * p.diasAtras, 0);
  const denom = n * somaXX - somaX * somaX;
  if (denom === 0) return null;
  const b = (n * somaXY - somaX * somaY) / denom;
  const a = (somaY - b * somaX) / n;
  return { a, b };
}

function montarTendenciaMetrica(pontos: PontoHistorico[]): TendenciaMetrica | null {
  const reg = regressaoLinear(pontos);
  if (!reg) return null;
  const atual = pontos[pontos.length - 1].valor;
  const projetado7d = Math.max(0, reg.a + reg.b * 7);
  const projetado30d = Math.max(0, reg.a + reg.b * 30);
  const variacaoRelativa30d = atual > 0 ? (projetado30d - atual) / atual : projetado30d > 0 ? 1 : 0;
  const direcao: TendenciaMetrica["direcao"] =
    Math.abs(variacaoRelativa30d) < VARIACAO_RELATIVA_ESTAVEL ? "estavel" : variacaoRelativa30d > 0 ? "subindo" : "caindo";
  return { atual, projetado7d, projetado30d, direcao };
}

type RunHistoricoRow = { resultado: ResultadoReputacaoAtendimentoEnriquecido | null; criado_em: string };

/** "Termômetro previsto" 7/30 dias — extrapolação linear das 3 taxas a partir do histórico
 * de rodadas já salvo em `calculadora_assinante_ai_runs` (RPC genérica, zero banco novo,
 * zero chamada nova à API do ML). `null` com menos de 2 rodadas com resultado válido — sem
 * sinal de tendência ainda, não inventa número. */
export async function calcularTendenciaReputacaoAvulso(assinanteId: string): Promise<TendenciaReputacao | null> {
  const { data } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "reputacao_atendimento",
    p_limit: JANELA_HISTORICO_RODADAS_TENDENCIA,
  });
  const linhas = ((data ?? []) as RunHistoricoRow[]).filter((r) => r.resultado != null);
  if (linhas.length < MIN_PONTOS_TENDENCIA) return null;

  // RPC devolve desc (mais recente primeiro) — inverte pra cronológica (mais antigo primeiro).
  const cronologica = [...linhas].reverse();
  const agora = Date.now();
  const comDias = cronologica.map((r) => ({
    diasAtras: -((agora - new Date(r.criado_em).getTime()) / (1000 * 60 * 60 * 24)),
    resultado: r.resultado as ResultadoReputacaoAtendimentoEnriquecido,
  }));

  const reclamacoes = montarTendenciaMetrica(comDias.map((p) => ({ diasAtras: p.diasAtras, valor: p.resultado.taxa_reclamacoes })));
  const atrasoManuseio = montarTendenciaMetrica(
    comDias.map((p) => ({ diasAtras: p.diasAtras, valor: p.resultado.taxa_atraso_manuseio }))
  );
  const cancelamento = montarTendenciaMetrica(comDias.map((p) => ({ diasAtras: p.diasAtras, valor: p.resultado.taxa_cancelamento })));

  if (!reclamacoes && !atrasoManuseio && !cancelamento) return null;
  return { reclamacoes, atrasoManuseio, cancelamento };
}

export type ReputacaoAtendimentoContextoAvulso = ReputacaoAtendimentoContexto & {
  rankingSkuReclamacoes: RankingSkuReclamacao[];
};

export async function buscarDadosReputacaoAtendimentoAvulso(
  assinanteId: string
): Promise<ReputacaoAtendimentoContextoAvulso | null> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;

  const [reputacao, perguntas, rankingSkuReclamacoes] = await Promise.all([
    mlBuscarReputacao(ctx),
    buscarPerguntasContexto(ctx),
    buscarRankingSkuReclamacoesAvulso(ctx).catch((e) => {
      console.error("[gestorReputacaoAtendimentoDadosAvulso] ranking de SKU falhou", e);
      return [];
    }),
  ]);
  if (!reputacao) return null;

  return {
    levelId: reputacao.levelId,
    powerSellerStatus: reputacao.powerSellerStatus,
    taxaReclamacoes: reputacao.reclamacoes?.rate ?? 0,
    qtdReclamacoes: reputacao.reclamacoes?.value ?? 0,
    taxaAtrasoManuseio: reputacao.atrasoManuseio?.rate ?? 0,
    qtdAtrasoManuseio: reputacao.atrasoManuseio?.value ?? 0,
    taxaCancelamento: reputacao.cancelamentos?.rate ?? 0,
    periodoMetrica: reputacao.atrasoManuseio?.period ?? reputacao.reclamacoes?.period ?? "60 days",
    fornecedoresAtraso: [],
    perguntas,
    rankingSkuReclamacoes,
  };
}

const JANELA_PERGUNTAS_RESOLVIDAS_DIAS = 30;

/** Métrica de valor (B5) — de toda resposta aplicada (clique real) nos últimos 30 dias,
 * conta quantas já não aparecem mais na lista de pendentes atual (`perguntasPendentesIds`)
 * — confirma que resolveu de verdade, não só que o assinante clicou em aplicar. Contagem,
 * nunca R$ (não dá pra converter pergunta respondida em dinheiro com certeza). */
async function contarPerguntasResolvidasAvulso(
  assinanteId: string,
  perguntasPendentesIds: Set<number>
): Promise<{ total_respondidas: number; confirmadas_resolvidas: number }> {
  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_PERGUNTAS_RESOLVIDAS_DIAS);

  const { data, error } = await supabaseAdmin
    .from("calculadora_assinante_ai_acoes")
    .select("item_id")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "reputacao_atendimento")
    .eq("tipo_acao", "aplicar_resposta_pergunta")
    .gte("criado_em", desde.toISOString());
  if (error) {
    console.error("[gestorReputacaoAtendimentoDadosAvulso] contagem de perguntas resolvidas falhou", error);
    return { total_respondidas: 0, confirmadas_resolvidas: 0 };
  }

  const linhas = (data ?? []) as { item_id: string | null }[];
  const totalRespondidas = linhas.length;
  const confirmadasResolvidas = linhas.filter(
    (l) => l.item_id && !perguntasPendentesIds.has(Number(l.item_id))
  ).length;
  return { total_respondidas: totalRespondidas, confirmadas_resolvidas: confirmadasResolvidas };
}

/** Monta o resultado a partir de dados já buscados (`buscarDadosReputacaoAtendimentoAvulso`)
 * — `apiKey` vem `null` quando não há pergunta pendente, ou quando há pergunta mas o
 * orçamento diário já estourou e não tem BYOK (decisão fica com quem chama, ver
 * gestorAvulsoSacRodar.ts). Nunca deixa a rodada inteira falhar só porque a resposta a
 * pergunta deu erro — diagnóstico de reputação continua valendo mesmo assim. */
export async function montarResultadoReputacaoAtendimentoAvulso(
  assinanteId: string,
  dados: ReputacaoAtendimentoContextoAvulso,
  apiKey: string | null
): Promise<ResultadoReputacaoComUso> {
  const { diagnostico, observacao } = classificarReputacao(dados);
  const perguntasPendentesIds = new Set(dados.perguntas.map((p) => p.perguntaId));
  const [tendencia, perguntasResolvidasConfirmado] = await Promise.all([
    calcularTendenciaReputacaoAvulso(assinanteId),
    contarPerguntasResolvidasAvulso(assinanteId, perguntasPendentesIds),
  ]);

  let respostaPorPergunta = new Map<number, { urgencia: "alta" | "media" | "baixa"; resposta_sugerida: string }>();
  let usage: UsoAnthropicGestor | null = null;
  if (dados.perguntas.length > 0 && apiKey) {
    try {
      const r = await responderPerguntasComIA(dados.perguntas, apiKey);
      respostaPorPergunta = r.respostas;
      usage = r.usage;
    } catch (e) {
      console.error("[gestorReputacaoAtendimentoDadosAvulso] resposta a pergunta falhou", e);
    }
  }

  const perguntas: PerguntaResultadoEnriquecido[] = dados.perguntas
    .map((p) => {
      const resposta = respostaPorPergunta.get(p.perguntaId);
      return {
        pergunta_id: p.perguntaId,
        item_id: p.itemId,
        titulo_anuncio: p.tituloAnuncio,
        pergunta: p.pergunta,
        dias_pendente: p.diasPendente,
        urgencia: resposta?.urgencia ?? "media",
        resposta_sugerida: resposta?.resposta_sugerida ?? "",
      };
    })
    .sort((a, b) => b.dias_pendente - a.dias_pendente);

  const resultado: ResultadoReputacaoAtendimentoEnriquecido = {
    diagnostico,
    observacao,
    nivel: dados.levelId,
    status_vendedor: dados.powerSellerStatus,
    taxa_reclamacoes: dados.taxaReclamacoes,
    qtd_reclamacoes: dados.qtdReclamacoes,
    taxa_atraso_manuseio: dados.taxaAtrasoManuseio,
    qtd_atraso_manuseio: dados.qtdAtrasoManuseio,
    taxa_cancelamento: dados.taxaCancelamento,
    periodo_metrica: dados.periodoMetrica,
    fornecedores_atraso: [],
    perguntas,
    tendencia,
    margem_ml: calcularMargemReputacaoMl(dados),
    ranking_sku_reclamacoes: dados.rankingSkuReclamacoes,
    perguntas_resolvidas_confirmado: perguntasResolvidasConfirmado,
  };

  return { resultado, usage };
}
