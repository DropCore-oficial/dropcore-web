/**
 * Custo real (R$) do chat do Tiago Silva — Anthropic Messages API síncrona (sem desconto de
 * Batch). Modelo trocado de Sonnet 5 pra **Haiku 4.5** em 2026-09-30: testado com pergunta
 * real (1 gestor e "resumo geral" com 4 gestores) — 2,3x a 3,3x mais barato, qualidade
 * equivalente nos dois testes. Os 4 gestores diários (Diogo/Andrey/Amanda/Ulisses) continuam
 * em Sonnet 5 via Batch API — são sugestão de preço/título/resposta que o seller aplica
 * direto, mais sensível que uma resposta de chat; troca deles é decisão separada, testada
 * gestor por gestor. Câmbio fixo aproximado via env, não é cotação automática — ajustar
 * `USD_BRL_CAMBIO` se variar muito.
 */
const USD_POR_BRL = Number(process.env.USD_BRL_CAMBIO ?? "5.5");

type PrecoModelo = { inputUsdPorMilhao: number; outputUsdPorMilhao: number };

/** Preço padrão pós-promoção ($3/$15, voltou 31/ago/2026) — usado pelos 4 gestores diários
 * via Batch API (ver calcularCustoReaisBatchGestor), não mais pelo chat. */
const PRECO_SONNET_5: PrecoModelo = { inputUsdPorMilhao: 3, outputUsdPorMilhao: 15 };
/** Preço do chat do Tiago Silva desde 2026-09-30. */
const PRECO_HAIKU_4_5: PrecoModelo = { inputUsdPorMilhao: 1, outputUsdPorMilhao: 5 };

export const MODELO_CHAT_TIAGO = "claude-haiku-4-5";
const PRECO_CHAT_TIAGO = PRECO_HAIKU_4_5;

/** Teto mensal por seller (R$) — bancado pela margem do add-on Gestores de IA (R$600/700),
 * não é mais orçamento separado de "Elite" (que deixou de existir). Decisão 2026-09-30.
 * Esse valor em R$ continua sendo a trava de verdade no backend (reserva-e-concilia) —
 * nunca removida, só não aparece mais crua pro seller (ver COTA_TOKENS_DIA_ESTIMADA). */
export const TETO_CHAT_TIAGO_REAIS_MES = 120;

/** Teto diário de verdade (R$) — decisão 2026-09-30: bloqueia o chat assim que o gasto real
 * de hoje (calculado em `gestorTiagoChatOrcamentoDia.ts`) atinge esse valor, libera de novo
 * à meia-noite (horário de Brasília). Continua existindo o teto mensal acima como rede de
 * segurança adicional (30 dias × R$4 = R$120, os dois batem). */
export const TETO_CHAT_TIAGO_REAIS_DIA = TETO_CHAT_TIAGO_REAIS_MES / 30;

/** Mistura input/output típica de 1 turno do chat (Haiku) — usada só pra converter o teto em
 * R$/dia pra um número de tokens "equivalente", pra mostrar % e tokens em vez de dinheiro na
 * tela (pedido do Sr Stark, 2026-09-30). Se a mistura real mudar bastante, esse número fica
 * impreciso — é só exibição, não afeta o bloqueio de verdade (que segue em R$ real). */
const MIX_INPUT_TIPICO = 0.6;
const MIX_OUTPUT_TIPICO = 0.4;
const PRECO_MEDIO_USD_POR_TOKEN =
  MIX_INPUT_TIPICO * (PRECO_CHAT_TIAGO.inputUsdPorMilhao / 1_000_000) +
  MIX_OUTPUT_TIPICO * (PRECO_CHAT_TIAGO.outputUsdPorMilhao / 1_000_000);
export const TOKENS_POR_REAL_ESTIMADO = 1 / (PRECO_MEDIO_USD_POR_TOKEN * USD_POR_BRL);

/** Cota diária "equivalente" em tokens, só pra exibição (barra de % + tokens, sem R$ na
 * tela) — arredondada pro milhar mais próximo. */
export const COTA_TOKENS_DIA_ESTIMADA = Math.round((TETO_CHAT_TIAGO_REAIS_DIA * TOKENS_POR_REAL_ESTIMADO) / 1000) * 1000;

export type UsoAnthropic = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

function usdParaReais(usd: number): number {
  return usd * USD_POR_BRL;
}

function custoReaisPorPreco(uso: UsoAnthropic, preco: PrecoModelo): number {
  /** Cache write (ephemeral 5min): ~25% mais caro que input normal. Cache read: ~10% do
   * preço de input normal — por isso Prompt Caching é obrigatório aqui. */
  const custoUsd =
    (uso.input_tokens / 1_000_000) * preco.inputUsdPorMilhao +
    (uso.output_tokens / 1_000_000) * preco.outputUsdPorMilhao +
    ((uso.cache_creation_input_tokens ?? 0) / 1_000_000) * (preco.inputUsdPorMilhao * 1.25) +
    ((uso.cache_read_input_tokens ?? 0) / 1_000_000) * (preco.inputUsdPorMilhao * 0.1);
  return usdParaReais(custoUsd);
}

/** Custo real do chat (Haiku 4.5), a partir do `usage` que a resposta da Anthropic devolve. */
export function calcularCustoReais(uso: UsoAnthropic): number {
  return custoReaisPorPreco(uso, PRECO_CHAT_TIAGO);
}

/** Desconto da Batch API (rodada diária de Diogo/Andrey/Amanda/Ulisses) — metade do preço
 * síncrono, ver `lib/ai/gestorBatchSubmit.ts`. Reaproveitado aqui (2026-09-30) pra somar o
 * custo real dos gestores no mesmo teto diário do chat — ver `gestorTiagoChatOrcamentoDia.ts`.
 * Sempre em preço Sonnet 5 — os 4 gestores diários não usam Haiku (ver comentário no topo). */
const DESCONTO_BATCH = 0.5;

export function calcularCustoReaisBatchGestor(inputTokens: number, outputTokens: number): number {
  return custoReaisPorPreco({ input_tokens: inputTokens, output_tokens: outputTokens }, PRECO_SONNET_5) * DESCONTO_BATCH;
}

/** Mesmo preço Sonnet 5, sem o desconto da Batch API — usado quando a chamada foi síncrona
 * (`client.messages.create` direto), caso da resposta a pergunta de comprador da Amanda
 * (ver `responderPerguntasComIA` em gestorReputacaoAtendimentoDados.ts), que nunca passa
 * pela Batch API mesmo rodando no cron diário junto dos outros gestores. Achado 2026-10-01:
 * usar `calcularCustoReaisBatchGestor` pra essa rodada subestimava o custo real pela metade. */
export function calcularCustoReaisSonnetSemDesconto(inputTokens: number, outputTokens: number): number {
  return custoReaisPorPreco({ input_tokens: inputTokens, output_tokens: outputTokens }, PRECO_SONNET_5);
}

/** Preço oficial da ferramenta `web_search` da Anthropic: US$10 por 1.000 buscas, cobrado
 * separado dos tokens (o conteúdo do resultado da busca entra como input_tokens normal,
 * já coberto por `calcularCustoReaisSonnetSemDesconto` — isso aqui é só a taxa da busca em
 * si). Usado pela primeira vez em "Ideias pra anúncio novo" (Andrey avulso, 2026-10-07). */
const USD_POR_MIL_BUSCAS_WEB = 10;

export function calcularCustoReaisWebSearch(numeroDeBuscas: number): number {
  return usdParaReais((numeroDeBuscas / 1000) * USD_POR_MIL_BUSCAS_WEB);
}

/**
 * Estimativa ANTES de chamar a Anthropic, só pra reservar orçamento com folga (nunca é o
 * valor cobrado de verdade — isso vem de `calcularCustoReais` depois, na conciliação).
 * Superestima de propósito: input por contagem real de caracteres do prompt (sem cache, pior
 * caso), output pelo teto configurado (`max_tokens`) — nunca reserva menos do que o pior
 * cenário possível, só mais.
 */
export function estimarCustoReaisAntesDaChamada(caracteresPrompt: number, maxTokensOutput: number): number {
  const tokensInputEstimados = Math.ceil(caracteresPrompt / 3.5);
  return calcularCustoReais({ input_tokens: tokensInputEstimados, output_tokens: maxTokensOutput });
}
