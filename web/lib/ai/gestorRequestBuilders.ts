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
import { PROMPT_ANUNCIOS_SEO, SCHEMA_ANUNCIOS_SEO, buscarDadosAnunciosSeo } from "./gestorAnunciosSeoDados";

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
    // Amostra fixa de até 20 anúncios (ver gestorAnunciosSeoDados.ts) — saída bem menor que a
    // do gestor de estoque, 4096 sobra de margem.
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
    messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, dados) }],
  };
}
