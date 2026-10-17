/**
 * Resumo diário de "3 ações" do Gestor (Tiago Silva) avulso — formato padrão de proposta
 * inspirado no doc externo dos 13 gestores de ML (Gestor/SKU/Ação/Motivo/Impacto/Confiança/
 * Risco), adaptado ao que os 4 gestores avulso realmente expõem hoje. "Impacto em R$" não é
 * comparável entre os 4 (só o ADS tem margem real; Estoque e Anúncio só têm severidade de
 * risco/gap) — por isso a pontuação usa severidade (0-3, da escala de risco que cada gestor
 * já calcula) em vez de inventar um valor monetário universal.
 *
 * Esforço é uma escala FIXA e arbitrária por tipo de ação (documentada aqui, não medida):
 * 1 = já existe botão de 1 clique no painel do gestor pra resolver; 2 = exige decisão/edição
 * manual do assinante fora de um botão existente; 3 = depende de dado externo ao sistema.
 *
 * Confiança reaproveita sinal que cada gestor já calcula (tendência, "piorou desde ontem",
 * resposta já rascunhada pela IA) — nunca um percentual inventado do zero.
 *
 * Zero banco novo: lê a última rodada de cada gestor via `fn_calculadora_assinante_ai_runs_recentes`,
 * já existente.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ResultadoEstoqueAvulsoEnriquecido } from "./gestorEstoqueDadosAvulso";
import type { ResultadoAdsAvulsoEnriquecido } from "./gestorAdsDadosAvulso";
import type { ResultadoAnunciosSeoEnriquecidoAvulso } from "./gestorAnunciosSeoDadosAvulso";
import type { ResultadoReputacaoAtendimentoEnriquecido } from "./gestorReputacaoAtendimentoDados";

export type GestorIdResumoAvulso = "estoque" | "reputacao_atendimento" | "ads" | "anuncios_seo";

const NOME_GESTOR: Record<GestorIdResumoAvulso, string> = {
  estoque: "Estoque",
  reputacao_atendimento: "SAC",
  ads: "ADS",
  anuncios_seo: "Anúncio",
};

export type PropostaResumoDiarioAvulso = {
  gestor: GestorIdResumoAvulso;
  gestor_nome: string;
  chave: string;
  item_ou_sku: string;
  acao: string;
  motivo: string;
  severidade: number;
  confianca: number;
  esforco: number;
  pontuacao: number;
  precisa_aprovacao: true;
  avaliar_em_dias: number;
};

export type ResumoDiarioAvulso = {
  top3: PropostaResumoDiarioAvulso[];
  total_candidatas: number;
  gestores_sem_rodada: string[];
};

function montarProposta(
  gestor: GestorIdResumoAvulso,
  chave: string,
  itemOuSku: string,
  acao: string,
  motivo: string,
  severidade: number,
  confianca: number,
  esforco: number,
  avaliarEmDias: number
): PropostaResumoDiarioAvulso {
  return {
    gestor,
    gestor_nome: NOME_GESTOR[gestor],
    chave,
    item_ou_sku: itemOuSku,
    acao,
    motivo,
    severidade,
    confianca,
    esforco,
    pontuacao: (severidade * confianca) / esforco,
    precisa_aprovacao: true,
    avaliar_em_dias: avaliarEmDias,
  };
}

function propostasEstoque(resultado: ResultadoEstoqueAvulsoEnriquecido): PropostaResumoDiarioAvulso[] {
  return resultado.skus
    .filter((s) => s.risco === "alto" || s.risco === "medio")
    .map((s) => {
      const temBotaoPausar = s.membros?.some((m) => m.estoque <= 1) ?? false;
      return montarProposta(
        "estoque",
        s.chave,
        s.nome_produto,
        s.acao_recomendada,
        s.dias_ate_ruptura !== null
          ? `Esgota em ${s.dias_ate_ruptura} dia(s) no ritmo de venda atual (${s.vendas_30d} vendas/30d).`
          : "Sem venda recente suficiente pra estimar prazo.",
        s.risco === "alto" ? 3 : 1,
        s.piorou_desde_ontem ? 0.9 : 0.6,
        temBotaoPausar ? 1 : 2,
        s.risco === "alto" ? 2 : 7
      );
    });
}

function propostasAds(resultado: ResultadoAdsAvulsoEnriquecido): PropostaResumoDiarioAvulso[] {
  return resultado.skus
    .filter((s) => s.diagnostico === "margem_abaixo_minima")
    .map((s) =>
      montarProposta(
        "ads",
        s.chave,
        s.nome_produto,
        "Preço abaixo da margem mínima configurada — revisar preço ou renegociar custo.",
        `Margem atual ${(s.margem_atual_pct ?? 0).toFixed(1)}% está abaixo do mínimo de ${s.margem_minima_pct}%.`,
        3,
        0.8,
        2,
        3
      )
    );
}

function propostasAnuncio(resultado: ResultadoAnunciosSeoEnriquecidoAvulso): PropostaResumoDiarioAvulso[] {
  const ACAO_POR_DIAGNOSTICO: Record<string, string> = {
    problema_titulo: "Revisar título do anúncio.",
    problema_descricao: "Revisar descrição do anúncio.",
    caracteristicas_incompletas: "Completar características faltando na ficha técnica.",
  };
  return resultado.anuncios
    .filter((a) => a.diagnostico !== "sem_problema_aparente")
    .map((a) => {
      const motivoBase = a.observacao;
      const motivo = a.pergunta_reforca_gap
        ? `${motivoBase} Comprador já perguntou sobre isso: "${a.pergunta_reforca_gap.texto.slice(0, 80)}".`
        : motivoBase;
      return montarProposta(
        "anuncios_seo",
        a.chave,
        a.familia_nome ?? a.item_id_representante,
        ACAO_POR_DIAGNOSTICO[a.diagnostico] ?? "Revisar anúncio.",
        motivo,
        resultado.destaque_prioridade.includes(a.chave) ? 2 : 1,
        a.pergunta_reforca_gap ? 0.8 : 0.6,
        1,
        7
      );
    });
}

function propostasSac(resultado: ResultadoReputacaoAtendimentoEnriquecido): PropostaResumoDiarioAvulso[] {
  const propostas: PropostaResumoDiarioAvulso[] = resultado.perguntas.map((p) => {
    const severidade = p.urgencia === "alta" ? 3 : p.urgencia === "media" ? 1.5 : 0.5;
    return montarProposta(
      "reputacao_atendimento",
      String(p.pergunta_id),
      p.titulo_anuncio,
      "Responder pergunta pendente no Mercado Livre.",
      `Pendente há ${p.dias_pendente} dia(s): "${p.pergunta.slice(0, 80)}".`,
      severidade,
      p.resposta_sugerida ? 0.8 : 0.4,
      1,
      1
    );
  });

  if (resultado.diagnostico === "critica") {
    propostas.push(
      montarProposta(
        "reputacao_atendimento",
        "_conta",
        "Reputação da conta",
        "Investigar causa da reputação crítica.",
        resultado.observacao,
        3,
        0.7,
        3,
        3
      )
    );
  }

  return propostas;
}

type RunRow<T> = { resultado: T | null };

async function buscarRodadas<T>(assinanteId: string, gestor: GestorIdResumoAvulso, limit: number): Promise<T[]> {
  const { data } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: gestor,
    p_limit: limit,
  });
  return ((data ?? []) as RunRow<T>[]).map((l) => l.resultado).filter((r): r is T => r !== null);
}

/** `null` quando o gestor nunca rodou pra esse assinante — nunca inventa proposta. */
async function ultimaRodada<T>(assinanteId: string, gestor: GestorIdResumoAvulso): Promise<T | null> {
  const [rodada] = await buscarRodadas<T>(assinanteId, gestor, 1);
  return rodada ?? null;
}

function ehResumoAnuncioSeo(resultado: unknown): resultado is ResultadoAnunciosSeoEnriquecidoAvulso {
  return (
    !!resultado &&
    typeof resultado === "object" &&
    Array.isArray((resultado as { anuncios?: unknown }).anuncios)
  );
}

/**
 * O gestor Anúncio grava na mesma tabela rodadas da varredura diária de SEO e rodadas da
 * feature separada "ideias de produto novo" (`tipo: "ideias_produto_novo"`) — pega a mais
 * recente que seja de fato a varredura de SEO, ignorando as de ideias pelo caminho.
 */
async function ultimaRodadaAnuncioSeo(assinanteId: string): Promise<ResultadoAnunciosSeoEnriquecidoAvulso | null> {
  const rodadas = await buscarRodadas<unknown>(assinanteId, "anuncios_seo", 10);
  return rodadas.find(ehResumoAnuncioSeo) ?? null;
}

export async function montarResumoDiarioAvulso(assinanteId: string): Promise<ResumoDiarioAvulso> {
  const [estoque, ads, anuncio, sac] = await Promise.all([
    ultimaRodada<ResultadoEstoqueAvulsoEnriquecido>(assinanteId, "estoque"),
    ultimaRodada<ResultadoAdsAvulsoEnriquecido>(assinanteId, "ads"),
    ultimaRodadaAnuncioSeo(assinanteId),
    ultimaRodada<ResultadoReputacaoAtendimentoEnriquecido>(assinanteId, "reputacao_atendimento"),
  ]);

  const gestoresSemRodada: string[] = [];
  if (!estoque) gestoresSemRodada.push(NOME_GESTOR.estoque);
  if (!ads) gestoresSemRodada.push(NOME_GESTOR.ads);
  if (!anuncio) gestoresSemRodada.push(NOME_GESTOR.anuncios_seo);
  if (!sac) gestoresSemRodada.push(NOME_GESTOR.reputacao_atendimento);

  const todasPropostas: PropostaResumoDiarioAvulso[] = [
    ...(estoque ? propostasEstoque(estoque) : []),
    ...(ads ? propostasAds(ads) : []),
    ...(anuncio ? propostasAnuncio(anuncio) : []),
    ...(sac ? propostasSac(sac) : []),
  ];

  todasPropostas.sort((a, b) => b.pontuacao - a.pontuacao);

  return {
    top3: todasPropostas.slice(0, 3),
    total_candidatas: todasPropostas.length,
    gestores_sem_rodada: gestoresSemRodada,
  };
}
