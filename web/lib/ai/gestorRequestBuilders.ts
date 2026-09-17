/**
 * Monta os params de request da Anthropic (mesmo model/thinking/schema/prompt) por gestor —
 * usado tanto pelo cron em lote (gestorBatchSubmit.ts, via Batch API) quanto pelo botão
 * "rodar agora" do seller (chamada síncrona, sem Batch — ver app/api/seller/gestores-ia/rodar).
 * Um único lugar de verdade pra configuração de cada gestor, os dois pontos de entrada só
 * decidem COMO submeter (lote assíncrono vs. chamada direta).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { montarPrompt } from "./gestorPrompts";
import {
  PROMPT_ANUNCIOS_SEO,
  SCHEMA_ANUNCIOS_SEO,
  buscarDadosAnunciosSeo,
  buscarDadosAnuncioUnico,
} from "./gestorAnunciosSeoDados";
export const MODELO_GESTORES_IA = "claude-sonnet-5";

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
