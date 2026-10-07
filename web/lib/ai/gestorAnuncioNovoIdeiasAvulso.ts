/**
 * "Ideias pra anúncio novo" — avulso, Andrey (Anúncios & SEO). Diferente do diagnóstico
 * principal (que analisa anúncio existente), aqui o assinante descreve com as próprias
 * palavras um produto que AINDA NÃO tem anúncio, e a IA devolve título, descrição e
 * características sugeridas pra ele usar ao publicar pelo próprio app do Mercado Livre.
 *
 * Decisão 2026-10-06 (Sr Stark, depois de eu já ter construído um fluxo de publicar
 * automático): nunca executa nada no Mercado Livre — só sugestão. Publicar de verdade
 * (fotos, frete, preço, estoque) continua sendo feito pelo assinante no app oficial.
 *
 * Revisão 2026-10-07 (Sr Stark, decisão final de escopo, depois de testar ao vivo o fluxo
 * real do Mercado Livre): o Andrey NÃO analisa mais a ficha técnica inteira da categoria —
 * escopo fechado em só 5 itens: Modelo (característica principal), Ocasiões e Estilos
 * (características secundárias), Título e Descrição. Tudo mais (Marca, Cor, Tamanho,
 * Material principal, Condição, embalagem, guia de tamanhos, fotos/vídeos/variação etc.) é
 * dado físico que só o vendedor tem ou que o próprio ML já resolve — não é papel da IA.
 *
 * Segunda decisão (mesmo dia): o seller pode publicar o MESMO produto em até 3 anúncios
 * separados (estratégia real pra capturar mais combinação de busca sem ficar com anúncios
 * idênticos — o que o ML pode flagar como duplicidade). Por isso Modelo/Título/Ocasiões/
 * Estilos vêm em 3 combinações DISTINTAS (uma por anúncio); a Descrição é só 1, reaproveitada
 * nos 3 (o conteúdo do produto não muda, só a vitrine de busca muda).
 */
import type { PromptTemplate } from "./gestorPrompts";

export type AtributoSeoContexto = {
  id: string;
  name: string;
  valueType: string;
  /** Nomes das opções válidas — só populado quando valueType === "list" (categoria mais
   * restrita). Normalmente Ocasiões/Estilos são texto livre multivalorado, sem lista fechada. */
  valoresPermitidos: string[];
  /** Limite real de caracteres vindo da API do ML (`value_max_length`) — null quando o ML
   * não informa. Usado pra não chutar um teto arbitrário no prompt nem no schema de saída. */
  valorMaxLength: number | null;
};

export type IdeiasProdutoNovoContexto = {
  categoriaNome: string;
  descricaoLivre: string;
  /** null quando a categoria escolhida não tem esse atributo — raro pra Modelo, mas cobre
   * categoria fora de moda/vestuário, onde Ocasiões/Estilos podem não existir. */
  modeloAtributo: AtributoSeoContexto | null;
  ocasioesAtributo: AtributoSeoContexto | null;
  estilosAtributo: AtributoSeoContexto | null;
};

function formatarAtributoOpcional(label: string, a: AtributoSeoContexto | null): string {
  if (!a) return `${label}: esse atributo não existe nessa categoria — deixe o campo vazio ("").`;
  const limite = a.valorMaxLength ? ` (máx. ${a.valorMaxLength} caracteres)` : "";
  if (a.valueType === "list" && a.valoresPermitidos.length > 0) {
    return `${label} [id: ${a.id}]${limite} — pode escolher VÁRIOS destes valores, separados por vírgula: ${a.valoresPermitidos.join(" | ")}`;
  }
  return `${label} [id: ${a.id}]${limite} — texto livre, pode (e deve) combinar vários valores separados por vírgula quando fizer sentido.`;
}

export const PROMPT_IDEIAS_PRODUTO_NOVO: PromptTemplate<IdeiasProdutoNovoContexto> = {
  id: "ideias_produto_novo",
  gestor: "anuncios_seo",
  titulo: "Ideias pra anúncio novo",
  persona:
    "Você é um especialista em SEO e otimização de anúncio de marketplace, ajudando um vendedor a preparar as " +
    "melhores informações pra publicar um produto NOVO (ainda sem anúncio) no Mercado Livre. Você tem acesso a " +
    "busca real na internet (ferramenta web_search) — USE ela de verdade antes de decidir título/modelo/" +
    "ocasiões/estilos. Nunca se limite ao vocabulário técnico do Mercado Livre nem só ao que já sabe de memória " +
    "— pesquise como compradores reais buscam esse tipo de produto, quais termos/tendências de moda, ocasião de " +
    "uso e estilo aparecem em lojas/blogs/redes sociais reais pra esse nicho específico, e use isso pra informar " +
    "as sugestões.",
  tarefa: [
    "Leia a descrição livre que o vendedor escreveu sobre o produto e a categoria já escolhida.",
    "Antes de gerar qualquer sugestão, faça pelo menos 1 ou 2 buscas reais na internet sobre esse tipo de " +
      "produto — termos de busca populares, tendência de moda/uso atual, contexto real de quem compra esse tipo " +
      "de peça. Não se limite ao que você já sabia antes de pesquisar; se a busca trouxer um termo ou contexto " +
      "melhor que o que você pensaria de cabeça, use o que a busca trouxe.",
    "O vendedor pode publicar o MESMO produto em até 3 anúncios diferentes no Mercado Livre — estratégia real " +
      "pra capturar mais combinações de busca sem ficar com anúncios idênticos (o que o ML pode marcar como " +
      "duplicidade). Por isso você vai gerar EXATAMENTE 3 combinações distintas de Título + Modelo + Ocasiões + " +
      "Estilos — pense nelas como 3 ângulos de busca diferentes pro mesmo produto real (ex.: um mais formal, " +
      "outro mais casual, outro focado num diferencial de material/estilo) — nunca 3 variações forçadas ou " +
      "repetidas, isso anula o propósito de ter 3.",
    "Título de cada anúncio: o limite real do Mercado Livre é 60 caracteres — ESSE LIMITE É RÍGIDO, NUNCA " +
      "passe de 60 (conte os caracteres antes de responder; se passar, o sistema corta sua frase no meio de " +
      "uma palavra, o que fica pior do que um título um pouco mais curto). Ao mesmo tempo, USE O MÁXIMO " +
      "possível desse espaço sem passar dele (chegar perto de 60, nunca entregar um título de 35-40 caracteres " +
      "por economia; cada caractere sobrando é palavra-chave de busca desperdiçada). A palavra-chave principal " +
      "(o que o produto É) vem " +
      "primeiro, seguida de TODAS as características diferenciadoras reais mencionadas pelo vendedor que " +
      "couberem no limite. Os 3 títulos têm que ser visivelmente diferentes entre si (ordem de palavra-chave, " +
      "ângulo, diferencial em destaque), mas todos descrevendo o MESMO produto real, sem contradição entre eles.",
    "Modelo de cada anúncio: nome comercial pensado pra busca, nunca um código de fábrica — combina tipo de " +
      "produto + diferencial real (material, estilo, público) mencionado pelo vendedor. O contexto mostra o " +
      "limite real de caracteres desse campo — use um nome descritivo (normalmente 2 a 6 palavras é suficiente " +
      "pra cobrir bem, o limite técnico é bem maior que isso, não precisa esgotar ele). Varie o ângulo nos 3 " +
      "(ex.: um batendo mais no material, outro no estilo, outro no uso).",
    "Ocasiões e Estilos de cada anúncio: pense em TODOS os contextos de uso e formas de uso plausíveis pra esse " +
      "tipo de produto (não só o que o vendedor citou literalmente) e distribua as melhores combinações entre " +
      "os 3 anúncios, cobrindo juntos uma superfície de busca maior do que um anúncio só cobriria — mas cada " +
      "anúncio individualmente também tem que fazer sentido sozinho (nunca deixar um anúncio com lista vazia ou " +
      "contexto bizarro só pra forçar diferença).",
    "Descrição (campo descricao_corpo): UMA só, reaproveitada nos 3 anúncios (o produto é o mesmo, só a vitrine " +
      "de busca varia). Completa e estruturada, não um resumo — cubra o que é o produto, pra que serve/quem usa, " +
      "material/composição, diferenciais reais mencionados pelo vendedor, e como cuidar/usar quando fizer " +
      "sentido pro tipo de produto. NÃO inclua FAQ aqui — o FAQ é um campo separado (veja abaixo).",
    "Escreva em frases curtas e completas, uma ideia por frase — evite frases longas com várias vírgulas " +
      "encadeadas. Frase curta reduz a chance de um corte/erro de geração no meio do texto, e frase incompleta " +
      "ou cortada é pior do que uma frase mais simples. Releia mentalmente cada frase antes de passar pra " +
      "próxima: ela faz sentido sozinha, do início ao fim?",
    "Atenção especial na seção de cuidado/manutenção da peça (lavagem, secagem, passar ferro etc.): NUNCA junte " +
      "duas instruções de cuidado na mesma frase com 'e' ou vírgula (ex.: 'evite X, e Y também ajuda'). Cada " +
      "instrução de cuidado é uma frase curta e independente, começando com verbo (Evite.../Lave.../Seque.../" +
      "Deixe...). Essa seção especificamente é onde mais aconteceu erro de geração em testes anteriores.",
    "FAQ (campo faq): lista de 3 a 5 perguntas frequentes SEPARADAS, cada uma com pergunta e resposta em campos " +
      "próprios (não é texto corrido) — pense nas dúvidas mais prováveis de quem está decidindo comprar esse " +
      "produto (tamanho/caimento, durabilidade, composição, forma de uso, cuidado) pra ajudar a quebrar objeção. " +
      "Cada resposta também em frase curta e completa, nunca cortada.",
  ],
  restricoes: [
    "Escopo fechado: só Título, Modelo, Ocasiões, Estilos e Descrição. Nunca sugira nem mencione Marca, Cor, " +
      "Tamanho, Material principal, Condição, embalagem, guia de tamanhos, variação, foto ou vídeo — isso é " +
      "papel do vendedor preencher direto no app do Mercado Livre, não dessa análise.",
    "Nunca invente especificação técnica, material ou benefício que contradiga ou vá além do que está implícito " +
      "na descrição do vendedor.",
    "Pra Ocasiões/Estilos, inferir contextos de uso plausíveis a partir do tipo de produto é esperado, não é " +
      "'inventar' — é exatamente o papel de SEO desse campo.",
    "Quando um atributo (Modelo/Ocasiões/Estilos) não existir na categoria (contexto vai avisar), deixe o campo " +
      "vazio (\"\") nos 3 anúncios — nunca invente um atributo que não existe nessa categoria.",
    "Não sugira preço, estoque nem frete — isso não é responsabilidade dessa análise.",
    "Isso é sugestão pro vendedor revisar e usar ao publicar manualmente — nunca afirme que o anúncio já existe.",
  ],
  formatoSaida:
    "JSON com o campo anuncios_sugeridos contendo uma lista com EXATAMENTE 3 itens (nem 2, nem 4 — sempre 3), " +
    "cada um com título, modelo, ocasiões e estilos sugeridos; mais descricao_corpo (texto único, sem FAQ " +
    "dentro); mais faq (lista de 3 a 5 itens com pergunta e resposta separadas); mais uma observação curta.",
  montarContexto: (ctx) =>
    `Categoria escolhida: ${ctx.categoriaNome}\n\n` +
    `Descrição do produto (escrita pelo vendedor):\n"${ctx.descricaoLivre}"\n\n` +
    `Atributos disponíveis nessa categoria:\n` +
    `- ${formatarAtributoOpcional("Modelo", ctx.modeloAtributo)}\n` +
    `- ${formatarAtributoOpcional("Ocasiões", ctx.ocasioesAtributo)}\n` +
    `- ${formatarAtributoOpcional("Estilos", ctx.estilosAtributo)}`,
};

/** Schema é montado por request (não é mais um objeto estático) pra usar o teto real de
 * caracteres de Modelo/Ocasiões/Estilos vindo da API do ML (`value_max_length`), em vez de
 * chutar um número — ver `AtributoSeoContexto.valorMaxLength`. Teto 255 só entra como
 * fallback quando o ML não informa nada pra esse atributo nessa categoria. */
export function buildSchemaIdeiasProdutoNovo(limites: {
  modelo: number | null;
  ocasioes: number | null;
  estilos: number | null;
}) {
  const FALLBACK = 255;
  return {
    type: "object",
    properties: {
      anuncios_sugeridos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titulo_sugerido: { type: "string", maxLength: 60 },
            modelo_sugerido: { type: "string", maxLength: limites.modelo ?? FALLBACK },
            ocasioes_sugeridas: { type: "string", maxLength: limites.ocasioes ?? FALLBACK },
            estilos_sugeridos: { type: "string", maxLength: limites.estilos ?? FALLBACK },
          },
          required: ["titulo_sugerido", "modelo_sugerido", "ocasioes_sugeridas", "estilos_sugeridos"],
          additionalProperties: false,
        },
      },
      descricao_corpo: { type: "string", maxLength: 2500 },
      faq: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pergunta: { type: "string", maxLength: 150 },
            resposta: { type: "string", maxLength: 500 },
          },
          required: ["pergunta", "resposta"],
          additionalProperties: false,
        },
      },
      observacao: { type: "string", maxLength: 200 },
    },
    required: ["anuncios_sugeridos", "descricao_corpo", "faq", "observacao"],
    additionalProperties: false,
  } as const;
}
