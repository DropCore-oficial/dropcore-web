/**
 * Dado real pro gestor "Reputação & Atendimento" (Amanda): métricas de reputação do
 * Mercado Livre (`seller_reputation` — reclamação, atraso no manuseio, cancelamento) +
 * perguntas de comprador sem resposta. Cruza a taxa de atraso no manuseio com o atraso real
 * de postagem por fornecedor (`pedido_eventos`, já em produção) — insight que só o DropCore
 * consegue (vê o lado do seller no marketplace E o lado do fornecedor internamente).
 *
 * Diferente do Diogo/Andrey, esse gestor não escolhe "os 20 piores" — reputação é 1 número
 * só por conta (não por SKU/anúncio), então o contexto pro prompt é sempre pequeno.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PromptTemplate } from "./gestorPrompts";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReputacao,
  mlBuscarPerguntasPendentes,
  mlBuscarItensDetalhe,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";
import { detectarDisputasFornecedor } from "./gestorDisputasFornecedorDados";

const MAX_PERGUNTAS = 15;
/** Só aponta fornecedor como causa provável com pelo menos essa quantidade de pedidos postados no período — 1 ou 2 pedidos não formam média confiável. */
const MIN_PEDIDOS_AMOSTRA_FORNECEDOR = 3;

export type FornecedorAtrasoContexto = {
  fornecedorNome: string;
  pedidosPostados: number;
  atrasoMedioDias: number;
};

export type PerguntaContexto = {
  perguntaId: number;
  itemId: string;
  tituloAnuncio: string;
  pergunta: string;
  diasPendente: number;
};

export type ReputacaoAtendimentoContexto = {
  levelId: string | null;
  powerSellerStatus: string | null;
  taxaReclamacoes: number;
  qtdReclamacoes: number;
  taxaAtrasoManuseio: number;
  qtdAtrasoManuseio: number;
  taxaCancelamento: number;
  periodoMetrica: string;
  fornecedoresAtraso: FornecedorAtrasoContexto[];
  perguntas: PerguntaContexto[];
};

function diasNoPeriodo(period: string): number {
  const m = period.match(/(\d+)/);
  return m ? Number(m[1]) : 60;
}

type EventoComPedido = {
  criado_em: string;
  pedidos: { seller_id: string; criado_em: string; fornecedor_id: string | null } | null;
};

/** Atraso real = tempo entre o pedido entrar no DropCore e ser marcado como postado
 * (`pedido_eventos`, tipos já usados em produção pro fluxo de repasse) — agrupado por
 * fornecedor. Cruza com `delayed_handling_time` do Mercado Livre no prompt, não aqui. */
async function buscarFornecedoresAtraso(sellerId: string, dias: number): Promise<FornecedorAtrasoContexto[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const { data: eventosRaw, error } = await supabaseAdmin
    .from("pedido_eventos")
    .select("criado_em, pedidos!inner(seller_id, criado_em, fornecedor_id)")
    .in("tipo", ["pedido_postado_manual", "pedido_postado_via_erp"])
    .eq("pedidos.seller_id", sellerId)
    .gte("criado_em", desde.toISOString());
  if (error) throw new Error(error.message);

  const eventos = (eventosRaw ?? []) as unknown as EventoComPedido[];
  const atrasosPorFornecedor = new Map<string, number[]>();
  for (const ev of eventos) {
    const fornecedorId = ev.pedidos?.fornecedor_id;
    const pedidoCriadoEm = ev.pedidos?.criado_em;
    if (!fornecedorId || !pedidoCriadoEm) continue;
    const atrasoDias = (new Date(ev.criado_em).getTime() - new Date(pedidoCriadoEm).getTime()) / (1000 * 60 * 60 * 24);
    const lista = atrasosPorFornecedor.get(fornecedorId) ?? [];
    lista.push(atrasoDias);
    atrasosPorFornecedor.set(fornecedorId, lista);
  }

  const relevantes = Array.from(atrasosPorFornecedor.entries()).filter(
    ([, lista]) => lista.length >= MIN_PEDIDOS_AMOSTRA_FORNECEDOR
  );
  if (relevantes.length === 0) return [];

  const { data: fornecedoresRaw } = await supabaseAdmin
    .from("fornecedores")
    .select("id, nome")
    .in("id", relevantes.map(([id]) => id));
  const nomePorId = new Map(((fornecedoresRaw ?? []) as { id: string; nome: string }[]).map((f) => [f.id, f.nome]));

  return relevantes
    .map(([id, atrasos]) => ({
      fornecedorNome: nomePorId.get(id) ?? "Fornecedor",
      pedidosPostados: atrasos.length,
      atrasoMedioDias: Math.round((atrasos.reduce((s, a) => s + a, 0) / atrasos.length) * 10) / 10,
    }))
    .sort((a, b) => b.atrasoMedioDias - a.atrasoMedioDias);
}

async function buscarPerguntasContexto(ctx: MercadoLivreAuthContext): Promise<PerguntaContexto[]> {
  const perguntas = await mlBuscarPerguntasPendentes(ctx, MAX_PERGUNTAS);
  if (perguntas.length === 0) return [];

  const itemIds = Array.from(new Set(perguntas.map((p) => p.itemId)));
  const itens = await mlBuscarItensDetalhe(itemIds, ctx);
  const tituloPorItem = new Map(itens.map((i) => [i.id, i.title]));
  const agora = Date.now();

  return perguntas.map((p) => ({
    perguntaId: p.id,
    itemId: p.itemId,
    tituloAnuncio: tituloPorItem.get(p.itemId) ?? p.itemId,
    pergunta: p.texto,
    diasPendente: Math.floor((agora - new Date(p.dataCriacao).getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

export async function buscarDadosReputacaoAtendimento(sellerId: string): Promise<ReputacaoAtendimentoContexto | null> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return null;

  const [reputacao, perguntas] = await Promise.all([mlBuscarReputacao(ctx), buscarPerguntasContexto(ctx)]);
  if (!reputacao) return null;

  const periodoMetrica = reputacao.atrasoManuseio?.period ?? reputacao.reclamacoes?.period ?? "60 days";
  const fornecedoresAtraso = await buscarFornecedoresAtraso(sellerId, diasNoPeriodo(periodoMetrica));

  // Detecção de disputa fornecedor x seller (evidência de reclamação real) — nunca deve
  // derrubar a rodada principal da Amanda se falhar, é só um efeito colateral.
  try {
    const { data: sellerRow } = await supabaseAdmin.from("sellers").select("org_id").eq("id", sellerId).maybeSingle();
    if (sellerRow?.org_id) await detectarDisputasFornecedor(sellerId, sellerRow.org_id);
  } catch (e) {
    console.error("[gestorReputacaoAtendimentoDados] detecção de disputa falhou", e);
  }

  return {
    levelId: reputacao.levelId,
    powerSellerStatus: reputacao.powerSellerStatus,
    taxaReclamacoes: reputacao.reclamacoes?.rate ?? 0,
    qtdReclamacoes: reputacao.reclamacoes?.value ?? 0,
    taxaAtrasoManuseio: reputacao.atrasoManuseio?.rate ?? 0,
    qtdAtrasoManuseio: reputacao.atrasoManuseio?.value ?? 0,
    taxaCancelamento: reputacao.cancelamentos?.rate ?? 0,
    periodoMetrica,
    fornecedoresAtraso,
    perguntas,
  };
}

function formatarPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatarContexto(d: ReputacaoAtendimentoContexto): string {
  const nivel = d.levelId ?? "sem nível ainda (conta nova ou sem venda suficiente)";
  const statusVendedor = d.powerSellerStatus ?? "nenhum";
  const fornecedores =
    d.fornecedoresAtraso.length > 0
      ? d.fornecedoresAtraso
          .map((f) => `  · ${f.fornecedorNome}: ${f.atrasoMedioDias} dias em média até postar (${f.pedidosPostados} pedidos no período)`)
          .join("\n")
      : "  (sem dado suficiente de fornecedor no período — menos de 3 pedidos postados)";
  const perguntas =
    d.perguntas.length > 0
      ? d.perguntas
          .map(
            (p) =>
              `  · pergunta_id ${p.perguntaId} sobre "${p.tituloAnuncio}" (item ${p.itemId}, pendente há ${p.diasPendente} dia(s)): "${p.pergunta}"`
          )
          .join("\n")
      : "  (nenhuma pergunta pendente agora)";

  return (
    `Reputação (período: ${d.periodoMetrica}):\n` +
    `  nível: ${nivel} | status de vendedor: ${statusVendedor}\n` +
    `  reclamações: ${formatarPct(d.taxaReclamacoes)} (${d.qtdReclamacoes} no período)\n` +
    `  atraso no manuseio/envio: ${formatarPct(d.taxaAtrasoManuseio)} (${d.qtdAtrasoManuseio} no período)\n` +
    `  cancelamentos: ${formatarPct(d.taxaCancelamento)}\n\n` +
    `Atraso médio de postagem por fornecedor (dado interno DropCore, mesmo período):\n${fornecedores}\n\n` +
    `Perguntas de comprador sem resposta:\n${perguntas}`
  );
}

export const PROMPT_REPUTACAO_ATENDIMENTO: PromptTemplate<ReputacaoAtendimentoContexto> = {
  id: "reputacao_atendimento_diagnostico",
  gestor: "reputacao",
  titulo: "Reputação & Atendimento",
  persona:
    "Você é um especialista em reputação e atendimento ao cliente em marketplace, que ajuda vendedores " +
    "a entender por que a reputação caiu e a não deixar pergunta de comprador parada sem resposta.",
  tarefa: [
    "Avalie a saúde da reputação com base nas métricas de reclamação, atraso no manuseio/envio e " +
      "cancelamento do período informado.",
    "Se a lista de atraso por fornecedor tiver um nome com atraso médio visivelmente maior que os " +
      "outros, E a taxa de atraso no manuseio do marketplace estiver relevante, mencione esse fornecedor " +
      "como possível causa raiz na observação — é um cruzamento que só esse sistema consegue fazer " +
      "(vê o lado do vendedor no marketplace e o lado do fornecedor ao mesmo tempo).",
    "Classifique a reputação em: saudável, atenção ou crítica.",
    "Para cada pergunta pendente, sugira uma resposta curta e educada baseada no texto da pergunta e " +
      "no título do anúncio, e classifique a urgência (pergunta sobre prazo/disponibilidade de produto " +
      "é mais urgente que dúvida genérica de uso).",
  ],
  restricoes: [
    "Só aponte um fornecedor como causa provável do atraso se o atraso médio dele for visivelmente " +
      "maior que o dos outros listados — nunca acuse sem diferença real nos números, e nunca mencione " +
      "fornecedor se a lista vier vazia (sem dado suficiente).",
    "Nunca prometa prazo de reposição de estoque ou data específica que você não tem certeza — se a " +
      "pergunta for sobre isso, a resposta sugerida deve pedir um retorno em breve, sem inventar data.",
    "resposta_sugerida tem que ser curta (até 300 caracteres) e no tom de atendimento ao cliente educado.",
    "Isso é sugestão pro vendedor revisar — nunca afirme que a resposta já foi enviada.",
  ],
  formatoSaida: [
    "Bloco 1: diagnóstico geral da reputação (saudável/atenção/crítica) + observação.",
    "Bloco 2: tabela de perguntas pendentes — pergunta_id | urgência | resposta sugerida.",
  ].join("\n"),
  montarContexto: formatarContexto,
};

export const SCHEMA_REPUTACAO_ATENDIMENTO = {
  type: "object",
  properties: {
    reputacao: {
      type: "object",
      properties: {
        diagnostico: { type: "string", enum: ["saudavel", "atencao", "critica"] },
        observacao: { type: "string", maxLength: 300 },
      },
      required: ["diagnostico", "observacao"],
      additionalProperties: false,
    },
    perguntas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pergunta_id: { type: "integer" },
          urgencia: { type: "string", enum: ["alta", "media", "baixa"] },
          resposta_sugerida: { type: "string", maxLength: 300 },
        },
        required: ["pergunta_id", "urgencia", "resposta_sugerida"],
        additionalProperties: false,
      },
    },
  },
  required: ["reputacao", "perguntas"],
  additionalProperties: false,
} as const;

// --- Enriquecimento pós-IA (código puro, não pedido pro modelo) -----------------------

type ReputacaoResultadoIA = {
  reputacao: { diagnostico: "saudavel" | "atencao" | "critica"; observacao: string };
  perguntas: { pergunta_id: number; urgencia: "alta" | "media" | "baixa"; resposta_sugerida: string }[];
};

export type PerguntaResultadoEnriquecido = {
  pergunta_id: number;
  item_id: string;
  titulo_anuncio: string;
  pergunta: string;
  dias_pendente: number;
  urgencia: "alta" | "media" | "baixa";
  resposta_sugerida: string;
};

export type ResultadoReputacaoAtendimentoEnriquecido = {
  diagnostico: "saudavel" | "atencao" | "critica";
  observacao: string;
  nivel: string | null;
  status_vendedor: string | null;
  taxa_reclamacoes: number;
  qtd_reclamacoes: number;
  taxa_atraso_manuseio: number;
  qtd_atraso_manuseio: number;
  taxa_cancelamento: number;
  periodo_metrica: string;
  fornecedores_atraso: FornecedorAtrasoContexto[];
  perguntas: PerguntaResultadoEnriquecido[];
};

/** Rebusca o contexto fresco (mesmo padrão dos outros gestores — batch pode levar horas,
 * não confiar no que foi mandado no submit) e junta com o veredito da IA por `pergunta_id`. */
export async function enriquecerResultadoReputacaoAtendimento(
  sellerId: string,
  resultadoIA: ReputacaoResultadoIA
): Promise<ResultadoReputacaoAtendimentoEnriquecido> {
  const dados = await buscarDadosReputacaoAtendimento(sellerId);
  const perguntaPorId = new Map(dados?.perguntas.map((p) => [p.perguntaId, p]) ?? []);

  const perguntas: PerguntaResultadoEnriquecido[] = resultadoIA.perguntas
    .map((p) => {
      const original = perguntaPorId.get(p.pergunta_id);
      if (!original) return null;
      return {
        pergunta_id: p.pergunta_id,
        item_id: original.itemId,
        titulo_anuncio: original.tituloAnuncio,
        pergunta: original.pergunta,
        dias_pendente: original.diasPendente,
        urgencia: p.urgencia,
        resposta_sugerida: p.resposta_sugerida,
      };
    })
    .filter((p): p is PerguntaResultadoEnriquecido => p !== null)
    .sort((a, b) => b.dias_pendente - a.dias_pendente);

  return {
    diagnostico: resultadoIA.reputacao.diagnostico,
    observacao: resultadoIA.reputacao.observacao,
    nivel: dados?.levelId ?? null,
    status_vendedor: dados?.powerSellerStatus ?? null,
    taxa_reclamacoes: dados?.taxaReclamacoes ?? 0,
    qtd_reclamacoes: dados?.qtdReclamacoes ?? 0,
    taxa_atraso_manuseio: dados?.taxaAtrasoManuseio ?? 0,
    qtd_atraso_manuseio: dados?.qtdAtrasoManuseio ?? 0,
    taxa_cancelamento: dados?.taxaCancelamento ?? 0,
    periodo_metrica: dados?.periodoMetrica ?? "60 days",
    fornecedores_atraso: dados?.fornecedoresAtraso ?? [],
    perguntas,
  };
}
