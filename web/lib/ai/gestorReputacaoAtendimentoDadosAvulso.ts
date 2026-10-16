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
  responderPerguntasComIA,
  type ReputacaoAtendimentoContexto,
  type PerguntaResultadoEnriquecido,
  type ResultadoReputacaoAtendimentoEnriquecido,
  type ResultadoReputacaoComUso,
  type UsoAnthropicGestor,
  type TendenciaMetrica,
  type TendenciaReputacao,
} from "./gestorReputacaoAtendimentoDados";
import { mlBuscarReputacao } from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

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

export async function buscarDadosReputacaoAtendimentoAvulso(
  assinanteId: string
): Promise<ReputacaoAtendimentoContexto | null> {
  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinanteId);
  if (!ctx) return null;

  const [reputacao, perguntas] = await Promise.all([mlBuscarReputacao(ctx), buscarPerguntasContexto(ctx)]);
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
  };
}

/** Monta o resultado a partir de dados já buscados (`buscarDadosReputacaoAtendimentoAvulso`)
 * — `apiKey` vem `null` quando não há pergunta pendente, ou quando há pergunta mas o
 * orçamento diário já estourou e não tem BYOK (decisão fica com quem chama, ver
 * gestorAvulsoAmandaRodar.ts). Nunca deixa a rodada inteira falhar só porque a resposta a
 * pergunta deu erro — diagnóstico de reputação continua valendo mesmo assim. */
export async function montarResultadoReputacaoAtendimentoAvulso(
  assinanteId: string,
  dados: ReputacaoAtendimentoContexto,
  apiKey: string | null
): Promise<ResultadoReputacaoComUso> {
  const { diagnostico, observacao } = classificarReputacao(dados);
  const tendencia = await calcularTendenciaReputacaoAvulso(assinanteId);

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
  };

  return { resultado, usage };
}
