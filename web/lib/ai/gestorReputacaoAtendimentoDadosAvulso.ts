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
import {
  buscarPerguntasContexto,
  classificarReputacao,
  responderPerguntasComIA,
  type ReputacaoAtendimentoContexto,
  type PerguntaResultadoEnriquecido,
  type ResultadoReputacaoAtendimentoEnriquecido,
  type ResultadoReputacaoComUso,
  type UsoAnthropicGestor,
} from "./gestorReputacaoAtendimentoDados";
import { mlBuscarReputacao } from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";

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
  dados: ReputacaoAtendimentoContexto,
  apiKey: string | null
): Promise<ResultadoReputacaoComUso> {
  const { diagnostico, observacao } = classificarReputacao(dados);

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
  };

  return { resultado, usage };
}
