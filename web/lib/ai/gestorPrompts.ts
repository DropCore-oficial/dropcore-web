// Prompts dos Gestores de IA — conteúdo estático (código, não tabela: ver docs/SCHEMA.md e
// memória de projeto "Briefing Gestores de IA" pro porquê). Estrutura de 5 blocos vinda do
// pacote externo de 49 prompts: persona → contexto (dado injetado automático, nunca colado
// pelo seller) → tarefa → restrições → formato de saída.
//
// Piloto real (roda em produção): "estoque_fulfillment", único gestor com dado 100% real
// hoje sem depender de conexão nova com marketplace (vem do sync Olist/Bling já existente).
// "preco_concorrencia" fica escrito e pronto, mas em espera até a conexão com Mercado
// Livre/Shopee/TikTok Shop existir de verdade (sem isso não tem preço de venda nem de
// concorrente pra buscar).

export type GestorId =
  | 'preco_concorrencia'
  | 'anuncios_seo'
  | 'estoque_fulfillment'
  | 'reputacao'
  | 'ads'
  | 'atendimento';

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

export interface ProdutoPrecoContexto {
  produto: string;
  precoAtual: number;
  custo: number;
  precosConcorrentes: number[];
}

function formatarProdutosPreco(produtos: ProdutoPrecoContexto[]): string {
  return produtos
    .map((p) => {
      const concorrentes = p.precosConcorrentes.length
        ? p.precosConcorrentes.map((v) => `R$ ${v.toFixed(2)}`).join(', ')
        : 'sem dado de concorrente';
      return `- ${p.produto}: preço atual R$ ${p.precoAtual.toFixed(2)}, custo R$ ${p.custo.toFixed(2)}, concorrentes: ${concorrentes}`;
    })
    .join('\n');
}

// Base: "Encontrar o melhor preço pra cada produto" (cluster Operação & dados). Adaptado do
// pacote original (que pedia "[cole: produto, preço atual, custo e preços de concorrentes]")
// pra receber dado já buscado via API em vez de colado à mão pelo seller.
export const PROMPT_PRECO_CONCORRENCIA: PromptTemplate<ProdutoPrecoContexto[]> = {
  id: 'preco_concorrencia_melhor_preco',
  gestor: 'preco_concorrencia',
  titulo: 'Encontrar o melhor preço pra cada produto',
  persona: 'Você é um especialista em pricing dinâmico pra vendedores de marketplace.',
  tarefa: [
    'Pra cada produto, sugira um preço ótimo que equilibre margem e competitividade.',
    'Justifique cada sugestão em 1 linha.',
    'Sinalize os produtos onde dá pra subir preço sem perder venda.',
  ],
  restricoes: [
    'Considere o preço do concorrente, mas não recomende guerra de preço sem necessidade.',
  ],
  formatoSaida: [
    'Tabela: Produto | Preço atual | Preço sugerido | Por quê',
    'Bloco final: os produtos onde dá pra subir preço sem perder venda.',
  ].join('\n'),
  montarContexto: (produtos) => `Meus produtos:\n${formatarProdutosPreco(produtos)}`,
};

export interface SkuRupturaContexto {
  sku: string;
  nomeProduto: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  vendas30d: number;
}

function formatarSkusRuptura(skus: SkuRupturaContexto[]): string {
  return skus
    .map(
      (s) =>
        `- ${s.sku} (${s.nomeProduto}): estoque atual ${s.estoqueAtual}, estoque mínimo ${s.estoqueMinimo}, vendido nos últimos 30 dias: ${s.vendas30d} unidades`
    )
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
    'Para cada SKU, avalie o risco de ruptura nos próximos dias com base no estoque disponível e na velocidade de venda dos últimos 30 dias.',
    'Classifique cada SKU em: risco alto, risco médio, sem risco, ou dado insuficiente (quando não houver venda suficiente pra estimar velocidade).',
    'Para os SKUs de risco alto, recomende uma ação concreta que o próprio seller controle.',
  ],
  restricoes: [
    'O seller não controla o estoque, quem repõe é o fornecedor — nunca recomende "comprar mais estoque" ou "contatar o fornecedor pra repor". A ação recomendada tem que ser algo que o seller mesmo executa: pausar ou despriorizar o anúncio, redirecionar verba de anúncio pago pra outro produto, ou avisar o comprador sobre prazo.',
    'Se não houver dado de venda suficiente pra estimar a velocidade de um SKU, marque como "dado insuficiente" em vez de arriscar um chute.',
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
          acao_recomendada: { type: 'string' },
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
