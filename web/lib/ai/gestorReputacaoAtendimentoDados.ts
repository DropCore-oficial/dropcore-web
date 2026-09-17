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
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReputacao,
  mlBuscarPerguntasPendentes,
  mlBuscarItensDetalhe,
  type MercadoLivreAuthContext,
} from "@/lib/mercadoLivreApiClient";
import { detectarDisputasFornecedor } from "./gestorDisputasFornecedorDados";
import { MODELO_GESTORES_IA } from "./gestorRequestBuilders";
import { parseGestorResposta } from "./gestorParseResposta";

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

// --- Diagnóstico de reputação — código puro, sem IA -----------------------
//
// Achado 2026-09-07 (mesmo padrão do Ulisses/Diogo): classificar saudável/atenção/crítica
// a partir de 3 taxas contra limite, e apontar fornecedor causa-provável quando o atraso
// dele se destaca dos outros, também é comparação de número — não precisa de IA. A única
// parte deste gestor que exige entender linguagem livre é responder a pergunta do
// comprador (`responderPerguntasComIA` abaixo), que continua via IA — e só é chamada
// quando existe pergunta pendente de verdade (economia: sem pergunta, zero tokens).

const RECLAMACOES_ATENCAO_PCT = 0.015;
const RECLAMACOES_CRITICO_PCT = 0.03;
const ATRASO_ATENCAO_PCT = 0.05;
const ATRASO_CRITICO_PCT = 0.1;
const CANCELAMENTO_ATENCAO_PCT = 0.015;
const CANCELAMENTO_CRITICO_PCT = 0.03;
/** Fornecedor só vira "causa provável" se o atraso médio dele for pelo menos 50% maior que
 * a média dos outros listados — "visivelmente maior", não qualquer diferença (mesma regra
 * que já estava explícita no prompt antigo, só que agora com número em vez de julgamento). */
const FORNECEDOR_ATRASO_DESTAQUE_FRACAO = 1.5;

function classificarReputacao(d: ReputacaoAtendimentoContexto): {
  diagnostico: "saudavel" | "atencao" | "critica";
  observacao: string;
} {
  const critica =
    d.taxaReclamacoes >= RECLAMACOES_CRITICO_PCT ||
    d.taxaAtrasoManuseio >= ATRASO_CRITICO_PCT ||
    d.taxaCancelamento >= CANCELAMENTO_CRITICO_PCT;
  const atencao =
    d.taxaReclamacoes >= RECLAMACOES_ATENCAO_PCT ||
    d.taxaAtrasoManuseio >= ATRASO_ATENCAO_PCT ||
    d.taxaCancelamento >= CANCELAMENTO_ATENCAO_PCT;
  const diagnostico = critica ? "critica" : atencao ? "atencao" : "saudavel";

  const partes: string[] = [];
  if (d.taxaReclamacoes >= RECLAMACOES_ATENCAO_PCT) partes.push(`reclamações em ${formatarPct(d.taxaReclamacoes)}`);
  if (d.taxaAtrasoManuseio >= ATRASO_ATENCAO_PCT) partes.push(`atraso no manuseio em ${formatarPct(d.taxaAtrasoManuseio)}`);
  if (d.taxaCancelamento >= CANCELAMENTO_ATENCAO_PCT) partes.push(`cancelamentos em ${formatarPct(d.taxaCancelamento)}`);

  let observacao =
    partes.length > 0 ? `Métrica(s) fora do saudável: ${partes.join(", ")}.` : "Reclamações, atraso e cancelamento dentro do saudável.";

  if (d.taxaAtrasoManuseio >= ATRASO_ATENCAO_PCT && d.fornecedoresAtraso.length > 0) {
    const [pior, ...resto] = d.fornecedoresAtraso; // já vem ordenado desc por atrasoMedioDias
    const destacaDosOutros =
      resto.length === 0 ||
      pior.atrasoMedioDias >= (resto.reduce((s, f) => s + f.atrasoMedioDias, 0) / resto.length) * FORNECEDOR_ATRASO_DESTAQUE_FRACAO;
    if (destacaDosOutros) {
      observacao += ` Possível causa: ${pior.fornecedorNome}, atraso médio de ${pior.atrasoMedioDias} dias pra postar (${pior.pedidosPostados} pedidos no período).`;
    }
  }

  return { diagnostico, observacao };
}

// --- Resposta a pergunta de comprador — a única parte deste gestor que ainda precisa de
// IA de verdade (ler texto livre e responder com naturalidade). Só chama a Anthropic
// quando há pergunta pendente — sem pergunta, nem monta o request. -----------------------

const SCHEMA_PERGUNTAS_RESPOSTA = {
  type: "object",
  properties: {
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
  required: ["perguntas"],
  additionalProperties: false,
} as const;

type PerguntaRespostaIA = { pergunta_id: number; urgencia: "alta" | "media" | "baixa"; resposta_sugerida: string };

async function responderPerguntasComIA(perguntas: PerguntaContexto[], apiKey: string): Promise<Map<number, PerguntaRespostaIA>> {
  const listaTexto = perguntas
    .map(
      (p) =>
        `- pergunta_id ${p.perguntaId} sobre "${p.tituloAnuncio}" (pendente há ${p.diasPendente} dia(s)): "${p.pergunta}"`
    )
    .join("\n");
  const prompt =
    "Você é um especialista em atendimento ao cliente de marketplace. Pra cada pergunta de comprador " +
    "abaixo, classifique a urgência (alta: prazo/disponibilidade de produto; média: dúvida específica " +
    "sobre o produto; baixa: dúvida genérica) e sugira uma resposta curta (até 300 caracteres), educada, " +
    "no tom de atendimento ao cliente.\n\n" +
    "RESTRIÇÕES: nunca prometa prazo de reposição de estoque ou data específica que você não tem certeza " +
    "— peça retorno em breve sem inventar data. Isso é sugestão pro vendedor revisar, nunca afirme que a " +
    "resposta já foi enviada.\n\n" +
    `Perguntas pendentes:\n${listaTexto}`;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODELO_GESTORES_IA,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_PERGUNTAS_RESPOSTA } },
    messages: [{ role: "user", content: prompt }],
  });
  const { resultado, erroMensagem } = parseGestorResposta(message);
  if (erroMensagem || !resultado) {
    console.error("[gestorReputacaoAtendimentoDados] resposta a pergunta falhou", erroMensagem);
    return new Map();
  }
  const parsed = resultado as { perguntas: PerguntaRespostaIA[] };
  return new Map(parsed.perguntas.map((p) => [p.pergunta_id, p]));
}

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

/** Monta o resultado inteiro do gestor Reputação & Atendimento — diagnóstico é código puro;
 * só chama a Anthropic se houver pergunta pendente de verdade (economia real, não só
 * teórica: a maioria das rodadas não tem pergunta nova). `apiKey` pode vir `null` quando
 * não há pergunta — nesse caso nunca é usada. */
export async function montarResultadoReputacao(sellerId: string, apiKey: string | null): Promise<ResultadoReputacaoAtendimentoEnriquecido | null> {
  const dados = await buscarDadosReputacaoAtendimento(sellerId);
  if (!dados) return null;

  const { diagnostico, observacao } = classificarReputacao(dados);

  const respostaPorPergunta =
    dados.perguntas.length > 0 && apiKey ? await responderPerguntasComIA(dados.perguntas, apiKey) : new Map<number, PerguntaRespostaIA>();

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

  return {
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
    fornecedores_atraso: dados.fornecedoresAtraso,
    perguntas,
  };
}
