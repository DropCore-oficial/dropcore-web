/**
 * Monta os params de request da Anthropic (mesmo model/thinking/schema/prompt) por gestor —
 * usado tanto pelo cron em lote (gestorBatchSubmit.ts, via Batch API) quanto pelo botão
 * "rodar agora" do seller (chamada síncrona, sem Batch — ver app/api/seller/gestores-ia/rodar).
 * Um único lugar de verdade pra configuração de cada gestor, os dois pontos de entrada só
 * decidem COMO submeter (lote assíncrono vs. chamada direta).
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  PROMPT_RISCO_RUPTURA_FULFILLMENT,
  SCHEMA_RISCO_RUPTURA_FULFILLMENT,
  montarPrompt,
} from "./gestorPrompts";
import { buscarDadosRupturaFulfillment } from "./gestorRupturaFulfillmentDados";
import {
  PROMPT_ANUNCIOS_SEO,
  SCHEMA_ANUNCIOS_SEO,
  buscarDadosAnunciosSeo,
  buscarDadosAnuncioUnico,
} from "./gestorAnunciosSeoDados";
import {
  PROMPT_REPUTACAO_ATENDIMENTO,
  SCHEMA_REPUTACAO_ATENDIMENTO,
  buscarDadosReputacaoAtendimento,
} from "./gestorReputacaoAtendimentoDados";
import { PROMPT_ADS, SCHEMA_ADS, buscarDadosAds } from "./gestorAdsDados";

export const MODELO_GESTORES_IA = "claude-sonnet-5";

export async function montarRequestEstoqueFulfillment(
  sellerId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dados = await buscarDadosRupturaFulfillment(sellerId);
  if (dados.length === 0) return null;
  return {
    model: MODELO_GESTORES_IA,
    // 8192 em vez de 4096: com catálogo até 96 SKUs (maior hoje), o JSON pode passar de
    // 4096 mesmo com acao_recomendada curta — dobrar dá margem sem custo relevante.
    max_tokens: 8192,
    // Desligado de propósito: é classificação sobre dado que já mandamos pronto, não precisa
    // de raciocínio — com thinking ligado o budget de max_tokens pode se esgotar em "pensar"
    // antes de emitir o JSON final.
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_RISCO_RUPTURA_FULFILLMENT } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_RISCO_RUPTURA_FULFILLMENT, dados) }],
  };
}

export async function montarRequestAnunciosSeo(
  sellerId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dados = await buscarDadosAnunciosSeo(sellerId);
  if (dados.length === 0) return null;
  return {
    model: MODELO_GESTORES_IA,
    // Amostra fixa de até 20 grupos (ver gestorAnunciosSeoDados.ts). 4096 bastava quando a
    // saída era só título+observação; desde que descricao_sugerida (até 1500 chars) e
    // caracteristicas_sugeridas entraram no schema (2026-08-23), o JSON pode passar disso
    // fácil e truncar no meio — mesmo tipo de bug já corrigido no gestor de estoque.
    max_tokens: 16384,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, dados) }],
  };
}

export async function montarRequestReputacaoAtendimento(
  sellerId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dados = await buscarDadosReputacaoAtendimento(sellerId);
  if (!dados) return null;
  return {
    model: MODELO_GESTORES_IA,
    // Reputação é sempre 1 registro + até 15 perguntas (MAX_PERGUNTAS) — contexto bem menor
    // que os outros gestores, mas mantém a mesma margem generosa (mesma classe de bug de
    // truncamento já corrigida nos outros dois).
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_REPUTACAO_ATENDIMENTO } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_REPUTACAO_ATENDIMENTO, dados) }],
  };
}

export async function montarRequestAds(
  sellerId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dados = await buscarDadosAds(sellerId);
  if (!dados) return null;
  return {
    model: MODELO_GESTORES_IA,
    // Até 20 SKUs por rodada (mesma amostra dos outros gestores), saída bem mais enxuta
    // que Andrey (sem descrição/características longas) — 8192 segue a mesma margem
    // generosa padrão pra evitar o bug de truncamento já visto nos outros gestores.
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ADS } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_ADS, dados) }],
  };
}

/** Análise sob demanda de 1 anúncio específico (não a amostra dos 20 piores) — usada pelo
 * handoff do Gestor 1 ("analisar este anúncio"). Não persiste rodada nova em
 * seller_ai_runs (ver app/api/seller/gestores-ia/diagnostico-anuncio) — é uma consulta
 * pontual, não substitui a rodada principal do gestor. */
export async function montarRequestAnuncioUnico(
  sellerId: string,
  itemId: string
): Promise<Anthropic.Messages.MessageCreateParamsNonStreaming | null> {
  const dado = await buscarDadosAnuncioUnico(sellerId, itemId);
  if (!dado) return null;
  return {
    model: MODELO_GESTORES_IA,
    // 1 grupo só, mas descricao_sugerida sozinha já pode chegar em ~1500 chars — 2048 dá margem.
    max_tokens: 2048,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, [dado]) }],
  };
}
