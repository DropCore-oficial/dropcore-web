// Prompts dos Gestores de IA — conteúdo estático (código, não tabela: ver docs/SCHEMA.md e
// memória de projeto "Briefing Gestores de IA" pro porquê). Estrutura de 5 blocos vinda do
// pacote externo de 49 prompts: persona → contexto (dado injetado automático, nunca colado
// pelo seller) → tarefa → restrições → formato de saída.
//
// "preco_concorrencia" foi descartado (2026-08-20): testado ao vivo contra a API do Mercado
// Livre com conta real, e não existe caminho pra preço de concorrente pra catálogo não
// catalogado (moda/marca própria) — price_to_win exige catalog_product_id (só produto
// padrão tipo eletrônico) e /sites/{site}/search devolve 403 forbidden (ML fechou esse
// endpoint pra app de terceiro). Ver memória de projeto "Briefing Gestores de IA".

export type GestorId = 'anuncios_seo' | 'estoque_fulfillment' | 'reputacao' | 'ads' | 'atendimento';

export interface PromptTemplate<TContexto> {
  id: string;
  gestor: GestorId;
  titulo: string;
  persona: string;
  tarefa: string[];
  restricoes: string[];
  formatoSaida: string;
  montarContexto: (dados: TContexto) => string;
}

export interface SkuRupturaContexto {
  sku: string;
  nomeProduto: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  vendas30d: number;
  /** Estoque atual ÷ velocidade diária de venda — null quando não há venda suficiente pra estimar. */
  diasAteRuptura: number | null;
  /** Pedido já pago, esperando só o estoque chegar — sinal de urgência mais forte que venda histórica. */
  pedidosAguardandoEstoque: number;
  /** Não entra no texto do prompt (a IA não decide nada com isso) — só carregado pra reaproveitar
   * esse mesmo fetch no enriquecimento pós-IA (gestorRupturaFulfillmentDados.enriquecerResultadoRuptura). */
  fornecedorNome: string | null;
}

function formatarSkusRuptura(skus: SkuRupturaContexto[]): string {
  return skus
    .map((s) => {
      const projecao = s.diasAteRuptura !== null ? `${s.diasAteRuptura} dias até esgotar` : 'sem projeção (pouca venda)';
      const aguardando = s.pedidosAguardandoEstoque > 0 ? `, ${s.pedidosAguardandoEstoque} pedido(s) JÁ PAGO(S) esperando esse estoque` : '';
      return `- ${s.sku} (${s.nomeProduto}): estoque atual ${s.estoqueAtual}, estoque mínimo ${s.estoqueMinimo}, vendido nos últimos 30 dias: ${s.vendas30d} unidades, ${projecao}${aguardando}`;
    })
    .join('\n');
}

// Reformulado a partir do gestor "Estoque & Fulfillment" original do briefing: no modelo do
// DropCore o seller não repõe estoque (quem faz isso é o fornecedor), então a ação nunca é
// "compre mais" — é sempre algo que o seller controla no próprio anúncio/verba de ads.
export const PROMPT_RISCO_RUPTURA_FULFILLMENT: PromptTemplate<SkuRupturaContexto[]> = {
  id: 'risco_ruptura_fulfillment',
  gestor: 'estoque_fulfillment',
  titulo: 'Risco de Ruptura & Fulfillment',
  persona:
    'Você é um especialista em fulfillment de e-commerce que ajuda vendedores que não ' +
    'controlam o próprio estoque (dropshipping) a evitar ruptura e cancelamento de venda.',
  tarefa: [
    'Para cada SKU, avalie o risco de ruptura nos próximos dias com base no estoque disponível, na velocidade de venda dos últimos 30 dias, e nos dias até esgotar já calculados no contexto.',
    'Classifique cada SKU em: risco alto, risco médio, sem risco, ou dado insuficiente (quando não houver venda suficiente pra estimar velocidade).',
    'Para os SKUs de risco alto, recomende uma ação concreta que o próprio seller controle.',
    'Se o SKU tiver pedido já pago esperando estoque, trate como prioridade máxima na ação recomendada — é cliente real esperando, não só uma projeção de venda.',
  ],
  restricoes: [
    'O seller não controla o estoque, quem repõe é o fornecedor — nunca recomende "comprar mais estoque" ou "contatar o fornecedor pra repor". A ação recomendada tem que ser algo que o seller mesmo executa: pausar ou despriorizar o anúncio, redirecionar verba de anúncio pago pra outro produto, ou avisar o comprador sobre prazo.',
    'Se não houver dado de venda suficiente pra estimar a velocidade de um SKU, marque como "dado insuficiente" em vez de arriscar um chute.',
    'acao_recomendada tem que ser curta (no máximo ~12 palavras) pra todo SKU, especialmente os de risco médio/baixo/dado insuficiente — o catálogo pode ter uma centena de SKUs e o texto de cada um soma no limite de saída.',
  ],
  formatoSaida: [
    'Tabela: SKU | Estoque atual | Vendas (30d) | Risco | Ação recomendada',
    'Bloco final: os SKUs de risco alto que merecem atenção imediata.',
  ].join('\n'),
  montarContexto: (skus) => `Meus SKUs habilitados pra venda:\n${formatarSkusRuptura(skus)}`,
};

// JSON Schema do output estruturado (output_config.format) — mesma forma descrita em
// formatoSaida acima, mas em schema pra virar componente estruturado no front, não texto
// solto. Ver shared/tool-use-concepts.md (Structured Outputs) na skill claude-api.
export const SCHEMA_RISCO_RUPTURA_FULFILLMENT = {
  type: 'object',
  properties: {
    skus: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          estoque_atual: { type: 'integer' },
          vendas_30d: { type: 'integer' },
          risco: {
            type: 'string',
            enum: ['alto', 'medio', 'sem_risco', 'dado_insuficiente'],
          },
          acao_recomendada: { type: 'string', maxLength: 100 },
        },
        required: ['sku', 'estoque_atual', 'vendas_30d', 'risco', 'acao_recomendada'],
        additionalProperties: false,
      },
    },
    destaque_risco_alto: {
      type: 'array',
      items: { type: 'string' },
      description: 'SKUs de risco alto que merecem atenção imediata.',
    },
  },
  required: ['skus', 'destaque_risco_alto'],
  additionalProperties: false,
} as const;

export function montarPrompt<TContexto>(
  template: PromptTemplate<TContexto>,
  dados: TContexto
): string {
  return [
    template.persona,
    '',
    'CONTEXTO:',
    template.montarContexto(dados),
    '',
    'SUA TAREFA:',
    ...template.tarefa.map((passo, i) => `${i + 1}. ${passo}`),
    '',
    'RESTRIÇÕES:',
    ...template.restricoes.map((r) => `- ${r}`),
    '',
    'FORMATO DE SAÍDA:',
    template.formatoSaida,
  ].join('\n');
}
