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

// Gestor "Estoque & Fulfillment" (Diogo) deixou de usar prompt/schema de IA em 2026-09-07
// — risco e ação recomendada viraram código puro (comparação de dias-até-ruptura contra
// limite, ver `classificarSkuRuptura` em gestorRupturaFulfillmentDados.ts). `montarPrompt`
// abaixo continua valendo pros outros gestores que ainda usam IA de verdade.

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
