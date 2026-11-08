/**
 * Dado real pro gestor "Anúncios & SEO": busca os anúncios ativos do seller no Mercado
 * Livre, escolhe os 20 piores por venda histórica entre os que já estão no ar há 30+ dias
 * (evita julgar anúncio novo sem dado suficiente), e complementa com descrição + visitas +
 * completude da ficha técnica (características principais/secundárias da categoria).
 *
 * Catálogo pode ter centenas de anúncios (ex.: 563 na conta de teste) — não dá pra mandar
 * tudo pro prompt (mesmo estouro de token que já corrigimos no gestor de Ruptura). Por isso
 * primeiro passo é local: busca até 100 anúncios ativos (1 chamada), pega detalhe de todos
 * via multiget, e só faz as chamadas caras (descrição + visitas, 1 por item) nos 20
 * selecionados — não no catálogo inteiro.
 *
 * Unidade de análise é o GRUPO, não o anúncio isolado (2026-08-23): título, descrição,
 * características e guia de tamanhos são avaliados 1x por família (o Mercado Livre nem
 * permite editar título por variante — só faz sentido sugerir 1 título base pra família
 * inteira). Só a contagem de fotos continua por anúncio (cada variação tem seu próprio
 * conjunto de fotos, faz sentido isolado). Efeito colateral bom: menos chamada de API e
 * menos token gasto por rodada — 4 anúncios da mesma família viram 1 entrada no prompt.
 *
 * Análise de preço NÃO é responsabilidade desse gestor (decisão 2026-08-23) — precisa de
 * custo do produto, taxa de venda (Clássico/Premium) e frete cobrado pelo ML pra fazer
 * sentido, isso é escopo do Ulisses (Ads), não do Andrey (Anúncios & SEO).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PromptTemplate } from "./gestorPrompts";
import { paiKey } from "@/lib/produtoTabelaMedidasDb";
import { calcularPrecoAncora } from "@/lib/margemCalculo";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarItensAtivos,
  mlBuscarItensDetalhe,
  mlBuscarDescricao,
  mlBuscarVisitas30d,
  mlBuscarAtributosCategoria,
  mlSugerirCategoria,
  menorLadoFotoMaxSize,
  proporcaoFotoRecomendada,
  type MercadoLivreAuthContext,
  type MercadoLivreItemDetail,
  type MercadoLivreAtributoCategoria,
} from "@/lib/mercadoLivreApiClient";

export type MembroAnuncioSeo = {
  itemId: string;
  tituloCompleto: string;
  quantidadeFotos: number;
  /** true quando a foto de capa está abaixo da resolução mínima recomendada — sinal
   * diferente de "poucas fotos" (pode ter 5 fotos, todas de baixa qualidade). */
  fotoBaixaResolucao: boolean;
  /** true quando a foto de capa não está nem quadrada (1200×1200, ativa zoom) nem vertical
   * (~1200×1540, 4:5, recomendada pra moda) — fora dos dois formatos que o próprio ML
   * documenta como ideais (confirmado 2026-10-20, ver `proporcaoFotoRecomendada`). Sinal
   * diferente de `fotoBaixaResolucao`: uma foto pode ter resolução alta e mesmo assim estar
   * numa proporção que cria corte/sobra estranha no feed mobile. */
  fotoForaDoPadrao: boolean;
  diasNoAr: number;
  vendasTotais: number;
  visitas30d: number;
  /** Venda real dos últimos 30 dias (via `/orders/search`, mesma fonte que Estoque/ADS já
   * usam) — diferente de `vendasTotais` (`sold_quantity`, lifetime). Necessário pro funil
   * visita→venda: comparar `vendasTotais` direto com `visitas30d` dava conta errada (anúncio
   * antigo com venda histórica alta parecia "convertendo bem" mesmo parado há meses). Só
   * preenchido pelo avulso hoje (`gestorAnunciosSeoDadosAvulso.ts`), por isso é opcional —
   * mesmo padrão de `perguntaReforcaGap`/`reclamacaoAbertaCodigo` abaixo. */
  vendasReais30d?: number;
};

export type AtributoFaltando = {
  id: string;
  name: string;
  /** "list" = só aceita valor de `valoresPermitidos`; outros tipos aceitam texto livre. */
  valueType: string;
  valoresPermitidos: string[];
};

/** Característica já preenchida (não vazia) — usada pra checar cobertura de palavra-chave,
 * ver `atributosSemReforcoNoTexto`. */
export type AtributoPreenchido = {
  id: string;
  name: string;
  valor: string;
  /** Só quando o atributo é de lista fechada (`valueType === "list"`) — outros valores
   * válidos do catálogo do Mercado Livre pra esse mesmo atributo, usado só pra distinguir
   * "valor ausente do texto" de "valor conflitante com outro já presente" (ver
   * `atributosSemReforcoNoTexto`). */
  valoresPermitidos?: string[];
};

/** Achado real 2026-10-14: ficha técnica dizia "Gola: Mao" num anúncio cujo título já dizia
 * "Gola Padre" — a IA tentou enfiar "Mao" no título sugerido, criando uma troca sem sentido
 * (o vendedor nem reconhecia "gola mão" como termo real). Causa raiz: `atributosSemReforcoNoTexto`
 * só sabia dizer "essa palavra não está no texto", sem checar se o texto já tinha uma
 * resposta DIFERENTE (e válida) pra esse mesmo atributo — tratava ausência e conflito como a
 * mesma coisa. Esse tipo isola o caso de conflito pra UI e prompt avisarem em vez de sugerir
 * troca cega. */
export type AtributoConflitante = AtributoPreenchido & {
  /** Outro valor válido do catálogo pra esse mesmo atributo que já aparece no título ou na
   * descrição — ficha técnica e texto discordam sobre o mesmo campo. */
  valorNoTexto: string;
};

export type AnuncioSeoContexto = {
  /** family_id (string) quando o anúncio pertence a uma família, ou o próprio item_id quando é isolado — identifica o grupo pro prompt e pro enriquecimento pós-IA. */
  chave: string;
  /** Anúncio usado como referência pra descrição/ficha técnica/guia de medidas e como link padrão — o de mais venda do grupo (mais dado histórico). */
  itemIdRepresentante: string;
  familiaNome: string | null;
  tituloExemplo: string;
  descricaoResumo: string;
  preco: number;
  atributosPrincipaisFaltando: AtributoFaltando[];
  atributosSecundariosFaltando: AtributoFaltando[];
  tabelaMedidasFaltando: boolean;
  /** Sinal determinístico (não pedido pra IA): a busca de categoria do próprio Mercado
   * Livre, a partir do título, não devolveu a categoria atual do anúncio entre as 3
   * mais prováveis — indício de categoria errada, causa raiz diferente de texto fraco
   * (anúncio pode ficar invisível na busca mesmo com título/descrição bons). */
  categoriaProvavelmenteErrada: boolean;
  categoriaSugeridaNome: string | null;
  /** Sinal determinístico (comparação de título entre famílias ativas do próprio seller,
   * não pedido pra IA) — indício de anúncio duplicado. Só o lado mais fraco (menos venda)
   * recebe isso; o forte não é penalizado. Ver `detectarDuplicados`. */
  duplicidade: DuplicidadeAnuncio | null;
  /** Sinal determinístico (não pedido pra IA): característica já preenchida cujo valor não
   * aparece no título nem na descrição — a ficha técnica "sabe" uma informação que o texto
   * buscável por palavra-chave livre não reforça. Ficha técnica alimenta FILTRO de busca do
   * marketplace, mas é o texto (título/descrição) que o buscador indexa por palavra-chave —
   * os dois precisam reforçar o mesmo dado. Ver `atributosSemReforcoNoTexto`. */
  atributosSemReforcoTexto: AtributoPreenchido[];
  /** Sinal determinístico (não pedido pra IA): característica preenchida cujo valor não
   * aparece no texto, MAS outro valor válido do catálogo pra esse mesmo atributo já aparece
   * — ficha técnica e texto discordam (ex.: ficha diz "Gola: Mao", título já diz "Gola
   * Padre"). Diferente de "ausente" (atributosSemReforcoTexto): aqui já existe uma resposta
   * no texto, só que diferente — não é pra sugerir trocar cego, é pra avisar da divergência.
   * Ver `atributosSemReforcoNoTexto`. */
  atributosConflitantes: AtributoConflitante[];
  membros: MembroAnuncioSeo[];
  /** Pergunta pendente real de comprador (Mercado Livre) cujo texto reforça um gap estrutural
   * já detectado (ex.: pergunta cita "tamanho" e o grupo tem característica de tamanho vazia)
   * — evidência concreta de comprador pedindo essa informação agora. Só preenchido pelo
   * avulso hoje (`gestorAnunciosSeoDadosAvulso.ts`); hub não cruza isso ainda, por isso é
   * opcional e `formatarAnunciosSeo` só menciona quando presente. */
  /** `repeticoes` conta em quantas das últimas rodadas salvas esse mesmo gap já reforçou
   * pergunta pra esse mesmo grupo (2026-10-17, agregação de `calculadora_assinante_ai_runs`,
   * sem API nova) — reforça urgência real ("perguntam isso toda hora"), não é só 1 ocorrência. */
  perguntaReforcaGap?: { pergunta: string; itemId: string; gap: string; repeticoes: number } | null;
  /** Código bruto (`reason_id`) de reclamação pós-venda em aberto nesse grupo. Só preenchido
   * pelo avulso hoje, mesmo motivo do campo acima. */
  reclamacaoAbertaCodigo?: string | null;
  /** Motivo humano (já em português) do código acima — resolvido via API oficial do ML
   * (`GET /post-purchase/v1/claims/reasons/{reason_id}`, testado ao vivo 2026-10-17). Antes
   * não existia essa tradução ("ML não documenta esses códigos"); o endpoint devolve o texto
   * real, não precisa mais evitar mencionar o motivo. `null` quando o código não resolveu. */
  reclamacaoAbertaMotivo?: string | null;
  /** Classificação própria do ML pro motivo (`settings.rules_engine_triage` do endpoint de
   * reasons) — ex. `["repentant"]` pra arrependimento de compra. Achado real 2026-10-17:
   * código `PDD9939` (categoria "produto diferente/defeituoso") na prática é 100%
   * arrependimento, nada a ver com o anúncio estar errado — por isso o prefixo do código
   * sozinho não basta pra decidir se vale mencionar na observação do Anúncio, usa esse campo
   * junto. */
  reclamacaoAbertaTriage?: string[];
  /** Funil de CONVERSÃO (2026-10-18): `true` quando o grupo teve visita real nos últimos 30
   * dias e zero venda real no mesmo período — ou seja, teve tráfego e não converteu. Sinal
   * objetivo (não é limiar de "% de conversão saudável" inventado), ver `vendasReais30d`.
   * Achado real 2026-10-19: Ads/orçamento é fator de TRÁFEGO (gera visita), não de
   * conversão — não entra nessa cascata, ver `visitasBaixasAlerta` abaixo pro lugar certo
   * desse sinal. Só preenchido pelo avulso hoje. */
  funilAlerta?: boolean;
  /** Causa mais provável do funil de conversão quebrado, verificada com dado real de outro
   * gestor (nunca "pode ser X ou Y" solto) — `null` só quando `funilAlerta` é `false`. Ordem
   * de checagem: reclamação aberta > reputação da conta abaixo do nível bom > nenhuma
   * promoção/desconto ativo > preço subiu frente ao próprio histórico (~60 dias atrás,
   * nunca comparado com concorrência — isso foi testado ao vivo 2026-08-20 e a API do ML não
   * expõe preço de concorrente pra catálogo não catalogado, ver `gestorPrompts.ts`) > a
   * variação (cor/tamanho) que mais vendia está sem estoque, mesmo com o anúncio inteiro
   * parecendo saudável (lê a última rodada do Estoque, `variacao_critica`) > resta texto/foto.
   *
   * `"pendente_resolver"` é um SENTINELA interno: esse campo é calculado aqui ANTES da IA
   * rodar (`montarContextoGrupoAvulso`), então ainda não existe `diagnostico` de texto nem
   * resultado da Laura — quem resolve esse sentinela pro valor final (`"texto_fraco"` |
   * `"foto_ruim"` | `"sem_causa_identificada"`) é `enriquecerResultadoAnunciosSeoAvulso`,
   * DEPOIS que a IA responde (achado real 2026-10-19: antes disso existia, o código caía
   * direto em "deve ser a foto" sem nunca olhar se a própria IA já tinha achado um problema
   * de título/descrição/ficha no mesmo anúncio — ficava contraditório na tela, badge dizendo
   * uma causa e o funil dizendo outra). Esse sentinela nunca deveria aparecer pro seller. */
  funilCausaProvavel?:
    | "reclamacao"
    | "reputacao_baixa"
    | "sem_promocao"
    | "preco_subiu"
    | "variacao_sem_estoque"
    | "pendente_resolver"
    | null;
  /** Texto curto explicando a causa provável acima, pra exibir direto na UI sem a tela
   * precisar remontar a frase. */
  funilCausaDetalhe?: string | null;
  /** Foto de capa do representante do grupo (id + URL https real) — só preenchido pelo
   * avulso, usado só quando `funilCausaProvavel` fica pendente até depois da IA responder,
   * pra alimentar a análise de visão da Laura sem precisar buscar de novo. */
  representanteFotos?: { id: string; url: string }[];
  /** Funil de TRÁFEGO (2026-10-19): `true` quando o grupo teve ZERO visita real nos últimos
   * 30 dias, OU queda de pelo menos a metade frente a ~60 dias atrás (comparação com o
   * próprio histórico da conta, não limiar de mercado inventado) — problema diferente do de
   * conversão acima (aqui ninguém está nem vendo o anúncio). */
  visitasBaixasAlerta?: boolean;
  /** `"ads_removido"` quando o grupo tinha investimento em Ads há ~60 dias e não tem mais;
   * `"trafego_caiu_sem_causa_aparente"` quando não tinha Ads nem antes nem agora mas o
   * tráfego próprio caiu de verdade (candidato a testar Ads, nunca testado); `null` quando
   * `visitasBaixasAlerta` é `false` ou quando nenhuma das duas comparações bateu (não
   * inventa causa sem dado histórico por perto). */
  visitasBaixasCausaProvavel?: "ads_removido" | "trafego_caiu_sem_causa_aparente" | null;
  visitasBaixasCausaDetalhe?: string | null;
};

export type DuplicidadeAnuncio = {
  titulo_anuncio_forte: string;
  vendas_anuncio_forte: number;
  vendas_anuncio_atual: number;
  /** false quando alguma variação do grupo fraco é Full ou tem oferta relâmpago ativa —
   * nesses casos o botão "Pausar" não deve aparecer, só o aviso de texto explicando por quê
   * (pausar Full prende estoque no centro de distribuição + cobra taxa de item parado;
   * pausar com oferta ativa interrompe uma promoção convertendo agora). */
  pode_pausar: boolean;
  motivo_bloqueio: string | null;
};

export const DIAS_MINIMOS_NO_AR = 30;
export const MAX_CANDIDATOS = 20;
/** Heurística simples pra "poucas fotos" — checagem por código, não pedida pra IA (não precisa de raciocínio, é contagem). */
export const MIN_FOTOS_RECOMENDADO = 3;
/** ML recomenda foto quadrada com pelo menos 500px de lado pra boa visualização/zoom — usa
 * o menor lado de `max_size` (resolução original enviada) da foto de capa. */
export const MIN_LADO_FOTO_RECOMENDADO = 500;

/** Abaixo desse número de dias desde a última checagem "ok", um grupo cujas vendas não
 * mudaram nem um pouco é pulado nessa rodada — não gasta token de IA pra confirmar de novo
 * o que já sabemos. Decisão 2026-10-06: grupo nunca checado antes NUNCA é pulado (sempre
 * entra na primeira vez); sinal de "mudou" é só venda (sold_quantity, já vem de graça no
 * detalhe do item, sem chamada extra) — visita muda o tempo todo mesmo sem venda nova, usar
 * ela como critério de "não mudou" soltaria falso positivo demais (pularia grupo que só
 * perdeu visita, que é justamente um dos sinais que a IA deveria olhar). */
export const DIAS_RECHECAGEM_MINIMO = 7;

export type UltimaChecagemGrupo = { vendasTotais: number; quando: string };

/** true quando o grupo pode ser PULADO nessa rodada — já foi checado há menos de
 * `DIAS_RECHECAGEM_MINIMO` dias E a venda total não mudou nem um pouco desde então. */
export function grupoFoiCheckadoRecentementeSemMudanca(
  vendasTotalGrupoAtual: number,
  ultimaChecagem: UltimaChecagemGrupo | undefined
): boolean {
  if (!ultimaChecagem) return false;
  const diasDesde = (Date.now() - new Date(ultimaChecagem.quando).getTime()) / (1000 * 60 * 60 * 24);
  if (diasDesde >= DIAS_RECHECAGEM_MINIMO) return false;
  return vendasTotalGrupoAtual === ultimaChecagem.vendasTotais;
}

/** Resultado salvo mínimo que basta pra extrair "vendas totais do grupo na rodada
 * anterior" — tanto `seller_ai_runs.resultado` (hub) quanto `calculadora_assinante_ai_runs.
 * resultado` (avulso) têm esse formato, só a tabela de origem muda entre os dois. */
export type AnuncioResultadoAnteriorMinimo = {
  chave: string;
  membros?: { vendas_totais: number }[];
};

export function mapaVendasPorChave(
  anuncios: AnuncioResultadoAnteriorMinimo[],
  quando: string
): Map<string, UltimaChecagemGrupo> {
  const mapa = new Map<string, UltimaChecagemGrupo>();
  for (const a of anuncios) {
    const vendasTotais = (a.membros ?? []).reduce((s, m) => s + (m.vendas_totais ?? 0), 0);
    mapa.set(a.chave, { vendasTotais, quando });
  }
  return mapa;
}

/** Cache por categoria — vários anúncios da amostra costumam repetir a mesma categoria, não
 * vale a pena buscar o schema de atributos de novo pra cada um. Exportado: reaproveitado
 * pelo gestor avulso (gestorAnunciosSeoDadosAvulso.ts), mesma lógica de julgamento, dado
 * isolado do hub. */
export async function buscarAtributosFaltando(
  item: MercadoLivreItemDetail,
  ctx: MercadoLivreAuthContext,
  cache: Map<string, MercadoLivreAtributoCategoria[]>
): Promise<{ principais: AtributoFaltando[]; secundarios: AtributoFaltando[]; preenchidos: AtributoPreenchido[] }> {
  let schema = cache.get(item.category_id);
  if (!schema) {
    schema = await mlBuscarAtributosCategoria(item.category_id, ctx);
    cache.set(item.category_id, schema);
  }

  const preenchidosNoItem = new Set((item.attributes ?? []).filter((a) => a.value_name).map((a) => a.id));
  // Atributo que define variação (ex: COLOR, SIZE) não fica no nível do item quando o
  // anúncio tem variations[] de verdade — vive em attribute_combinations de CADA variação.
  // Só conta como preenchido aqui se TODAS as variações tiverem o valor (uma variação sem
  // cor/tamanho é gap real, não falso positivo).
  const variacoes = item.variations ?? [];
  const preenchidoEmTodasVariacoes = (attrId: string): boolean =>
    variacoes.length > 0 &&
    variacoes.every((v) => (v.attribute_combinations ?? []).some((a) => a.id === attrId && a.value_name));

  const obrigatoriosFaltando = schema
    .filter((a) => a.required && !preenchidosNoItem.has(a.id) && !preenchidoEmTodasVariacoes(a.id))
    .map((a) => ({ id: a.id, name: a.name, valueType: a.valueType, valoresPermitidos: a.valoresPermitidos, relevance: a.relevance }));

  const schemaPorId = new Map(schema.map((a) => [a.id, a]));
  // Atributo técnico (referência de guia de tamanhos) — "grid_id"/"grid_row_id" não é
  // característica de produto, mesmo quando não leva `tags.hidden`.
  const VALUE_TYPES_TECNICOS = new Set(["grid_id", "grid_row_id"]);
  // IDs conhecidos do catálogo do Mercado Livre pra atributo de ano — achado real 2026-10-14:
  // "Ano de lançamento: 2025" virou literalmente o fim de um título sugerido em 2026, fazendo
  // o produto parecer estoque velho. Diferente de Marca/Gênero/Material (fato permanente do
  // produto), ano de lançamento envelhece — nunca deveria virar sugestão de texto pro título
  // ou descrição, então nem entra na lista de "preenchidos" (não vira "sem reforço" nem
  // "conflitante", simplesmente não é candidato a reforço de busca).
  const ATRIBUTOS_ANO_IDS = new Set(["RELEASE_YEAR", "MODEL_YEAR", "MANUFACTURING_YEAR"]);
  const NOME_ANO_REGEX = /\bano\b/i;
  const ehAtributoDeAno = (atributo: { id: string; name: string }): boolean =>
    ATRIBUTOS_ANO_IDS.has(atributo.id) || NOME_ANO_REGEX.test(atributo.name);
  // Só entra como "preenchido" pra fins de cobertura de palavra-chave quando NÃO é metadado
  // técnico/interno do ML (`tags.hidden`) nem referência de guia de tamanhos. Achado ao vivo
  // 2026-10-06, comparando atributo por atributo via API: `relevance` sozinha NÃO distingue
  // isso (peso de embalagem, ID de guia de tamanhos, "com provador virtual" etc. também vêm
  // com relevance 1/2) — sem esse filtro por `hidden`, o aviso de "palavra-chave sem reforço"
  // virava ruído disparando em todo anúncio. Ver docs/SCHEMA.md.
  const preenchidos: AtributoPreenchido[] = (item.attributes ?? [])
    .filter((a) => {
      if (!a.value_name) return false;
      const atributo = schemaPorId.get(a.id);
      if (!atributo || atributo.hidden) return false;
      if (ehAtributoDeAno(atributo)) return false;
      return !VALUE_TYPES_TECNICOS.has(atributo.valueType);
    })
    .map((a) => {
      const atributo = schemaPorId.get(a.id)!;
      return {
        id: a.id,
        name: atributo.name,
        valor: a.value_name as string,
        valoresPermitidos: atributo.valueType === "list" ? atributo.valoresPermitidos : undefined,
      };
    });

  return {
    principais: obrigatoriosFaltando.filter((a) => a.relevance === 1),
    secundarios: obrigatoriosFaltando.filter((a) => a.relevance !== 1),
    preenchidos,
  };
}

const STOPWORDS_COBERTURA = new Set(["de", "da", "do", "das", "dos", "com", "para", "e", "a", "o", "em", "no", "na", "um", "uma"]);

function normalizarTextoCobertura(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function palavrasSignificativas(valor: string): string[] {
  return normalizarTextoCobertura(valor)
    .split(/\s+/)
    .filter((p) => p.length > 2 && !STOPWORDS_COBERTURA.has(p));
}

/**
 * Característica já preenchida cujo valor não aparece (nem em parte) no título+descrição —
 * sinal determinístico, não pedido pra IA. Ficha técnica alimenta FILTRO de busca do
 * marketplace (comprador filtra por "Material: Linho"), mas título/descrição são o texto
 * indexado por palavra-chave livre — os dois precisam se reforçar. Considera "reforçado" se
 * QUALQUER palavra significativa do valor aparece no texto (valor composto tipo "Manga
 * Longa" não precisa bater 100% pra já ajudar o match).
 *
 * Separa em dois grupos (achado real 2026-10-14, ficha dizia "Gola: Mao" num anúncio cujo
 * título já dizia "Gola Padre" — a IA tentou trocar pelo valor da ficha, sem sentido):
 * - `semReforco`: o atributo realmente não tem resposta nenhuma no texto (ausência de verdade).
 * - `conflitantes`: o texto já tem OUTRO valor válido do catálogo pra esse mesmo atributo —
 *   ficha técnica e texto discordam, não é ausência, é divergência. Quem decide qual valor
 *   está certo é o vendedor, não a IA — por isso isolado, pra UI/prompt avisarem em vez de
 *   sugerir troca cega.
 */
// Achado real 2026-10-14: "Gênero: Masculino" (ficha) virou "CONFLITO" contra "Sem gênero
// infantil" (texto) em boa parte do catálogo de teste — mas "sem X" é negação, não
// afirmação de X; na verdade REFORÇA que não é infantil (compatível com Masculino), não
// contradiz. `includes()` batia na palavra sem olhar o que vinha antes dela. Por isso a
// checagem agora é por token (não substring) e ignora ocorrência com negação (sem/não/
// nunca) a até 2 palavras antes.
const NEGACOES = new Set(["sem", "nao", "nunca", "jamais"]);
const JANELA_NEGACAO = 2;

function apareceAfirmativamente(palavraAlvo: string, tokensTexto: string[]): boolean {
  for (let i = 0; i < tokensTexto.length; i++) {
    if (tokensTexto[i] !== palavraAlvo) continue;
    const precedentes = tokensTexto.slice(Math.max(0, i - JANELA_NEGACAO), i);
    if (!precedentes.some((t) => NEGACOES.has(t))) return true;
  }
  return false;
}

export function atributosSemReforcoNoTexto(
  preenchidos: AtributoPreenchido[],
  tituloEDescricao: string
): { semReforco: AtributoPreenchido[]; conflitantes: AtributoConflitante[] } {
  const tokensTexto = normalizarTextoCobertura(tituloEDescricao).split(/\s+/);
  const semReforco: AtributoPreenchido[] = [];
  const conflitantes: AtributoConflitante[] = [];

  for (const a of preenchidos) {
    const palavras = palavrasSignificativas(a.valor);
    if (palavras.length === 0) continue;
    if (palavras.some((p) => apareceAfirmativamente(p, tokensTexto))) continue;

    const valorNoTexto = (a.valoresPermitidos ?? []).find((permitido) => {
      if (permitido === a.valor) return false;
      const palavrasPermitido = palavrasSignificativas(permitido);
      return palavrasPermitido.length > 0 && palavrasPermitido.some((p) => apareceAfirmativamente(p, tokensTexto));
    });

    if (valorNoTexto) {
      conflitantes.push({ ...a, valorNoTexto });
    } else {
      semReforco.push(a);
    }
  }

  return { semReforco, conflitantes };
}

/** DropCore já tem tabela de medida (produto_tabela_medidas) por grupo de SKU, mas isso não
 * significa que o anúncio no ML tem o guia de tamanhos (SIZE_GRID_ID) anexado — os dois
 * lados são independentes (o dado existe aqui, mas ninguém necessariamente subiu ele lá). */
async function verificarTabelaMedidasFaltando(
  item: MercadoLivreItemDetail,
  sellerId: string
): Promise<boolean> {
  const { data: vinculo } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku")
    .eq("seller_id", sellerId)
    .eq("ml_item_id", item.id)
    .limit(1)
    .maybeSingle();
  if (!vinculo?.sku) return false;

  const grupoKey = paiKey(vinculo.sku);
  const { data: tabela } = await supabaseAdmin
    .from("produto_tabela_medidas")
    .select("medidas")
    .eq("grupo_key", grupoKey)
    .maybeSingle();
  const temTabelaNoDropCore =
    !!tabela?.medidas && typeof tabela.medidas === "object" && Object.keys(tabela.medidas).length > 0;
  if (!temTabelaNoDropCore) return false;

  const temGuiaNoAnuncio = (item.attributes ?? []).some((a) => a.id === "SIZE_GRID_ID" && a.value_name);
  return !temGuiaNoAnuncio;
}

export type ItemComDias = MercadoLivreItemDetail & { diasNoAr: number };

/** Agrupa itens elegíveis por família (family_id) — item sem família vira grupo de 1, usando o próprio item_id como chave. */
export function agruparPorFamilia(itens: ItemComDias[]): { chave: string; membros: ItemComDias[] }[] {
  const mapa = new Map<string, ItemComDias[]>();
  for (const item of itens) {
    const chave = item.family_id != null ? String(item.family_id) : item.id;
    const grupo = mapa.get(chave);
    if (grupo) grupo.push(item);
    else mapa.set(chave, [item]);
  }
  return Array.from(mapa.entries()).map(([chave, membros]) => ({ chave, membros }));
}

/** Tamanho/cor não conta pra comparação de título — senão "Camisa Azul P" e "Camisa Azul
 * G" pareceriam famílias diferentes quando na real são a mesma coisa. */
const STOPWORDS_DUPLICADO = new Set([
  "p", "m", "g", "gg", "pp", "xg", "eg", "xgg", "egg", "xxg",
  "branco", "branca", "preto", "preta", "azul", "vermelho", "vermelha",
  "verde", "marrom", "bege", "cinza", "amarelo", "amarela", "rosa", "roxo",
  "roxa", "laranja", "royal", "marinho", "bebe", "bebê", "mustang", "musgo",
  "liso", "lisa", "de", "da", "do", "com", "para", "e", "a", "o",
]);

function normalizarTituloDuplicado(titulo: string): string {
  const tokens = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS_DUPLICADO.has(t));
  return Array.from(new Set(tokens)).sort().join(" ");
}

function jaccardDuplicado(a: string, b: string): number {
  const sa = new Set(a.split(" "));
  const sb = new Set(b.split(" "));
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const uni = new Set([...sa, ...sb]).size;
  return uni === 0 ? 0 : inter / uni;
}

const JACCARD_MIN_DUPLICADO = 0.6;

/** Compara título entre TODAS as famílias ativas buscadas (não só a amostra de 20 piores
 * — o par forte de um duplicado costuma vender bem e cairia fora dessa amostra). "Kit N
 * Camisas" nunca compara com anúncio avulso — são produtos diferentes de verdade, não
 * duplicado (achado real 2026-09-02: comparação por similaridade pura dava falso positivo
 * aqui). Só marca o lado com MENOS venda total — o forte fica limpo, sem aviso. */
/** Pausar anúncio Full prende o estoque no centro de distribuição do próprio ML (o
 * vendedor não controla mais o envio) e ainda passa a cobrar taxa de "item parado" — achado
 * real pesquisado 2026-09-03. Pausar anúncio com oferta relâmpago ativa (`deal_ids`) mata
 * uma promoção convertendo agora. Nos dois casos, não oferecer o botão de pausar — só o
 * aviso de texto explicando por quê, revisão fica manual. */
function motivoBloqueioPausa(membros: ItemComDias[]): string | null {
  if (membros.some((m) => m.shipping?.logistic_type === "fulfillment")) {
    return "Esse anúncio usa Mercado Envios Full — pausar prende o estoque no centro de distribuição do ML e ainda cobra taxa de \"item parado\". Revise manualmente com cuidado.";
  }
  if (membros.some((m) => (m.deal_ids ?? []).length > 0)) {
    return "Esse anúncio tem uma promoção ativa agora (ex.: Oferta Relâmpago) — pausar interrompe a promoção no meio. Revise manualmente antes de agir.";
  }
  return null;
}

/** Exportado: reaproveitado pelo gestor avulso, mesma lógica de detecção de duplicado. */
export function detectarDuplicados(
  grupos: { chave: string; membros: ItemComDias[]; vendasTotalGrupo: number }[]
): Map<string, DuplicidadeAnuncio> {
  const resultado = new Map<string, DuplicidadeAnuncio>();
  const candidatos = grupos
    .map((g) => {
      const representante = [...g.membros].sort((a, b) => b.sold_quantity - a.sold_quantity)[0];
      return { ...g, tituloRepresentante: representante?.title ?? "", fingerprint: normalizarTituloDuplicado(representante?.title ?? "") };
    })
    .filter((g) => g.tituloRepresentante && !g.tituloRepresentante.toLowerCase().includes("kit"));

  for (const a of candidatos) {
    for (const b of candidatos) {
      if (a.chave === b.chave) continue;
      if (b.vendasTotalGrupo <= a.vendasTotalGrupo) continue; // só o mais fraco recebe o aviso
      if (jaccardDuplicado(a.fingerprint, b.fingerprint) < JACCARD_MIN_DUPLICADO) continue;
      const atual = resultado.get(a.chave);
      if (!atual || b.vendasTotalGrupo > atual.vendas_anuncio_forte) {
        const motivoBloqueio = motivoBloqueioPausa(a.membros);
        resultado.set(a.chave, {
          titulo_anuncio_forte: b.tituloRepresentante,
          vendas_anuncio_forte: b.vendasTotalGrupo,
          vendas_anuncio_atual: a.vendasTotalGrupo,
          pode_pausar: motivoBloqueio === null,
          motivo_bloqueio: motivoBloqueio,
        });
      }
    }
  }
  return resultado;
}

async function montarContextoGrupo(
  chave: string,
  membros: ItemComDias[],
  ctx: MercadoLivreAuthContext,
  sellerId: string,
  cacheAtributos: Map<string, MercadoLivreAtributoCategoria[]>
): Promise<AnuncioSeoContexto> {
  // Representante = quem tem mais venda no grupo (mais dado histórico pra basear a análise de texto).
  const representante = [...membros].sort((a, b) => b.sold_quantity - a.sold_quantity)[0];

  const [descricao, atributosFaltando, tabelaMedidasFaltando, categoriasSugeridas, membrosContexto] =
    await Promise.all([
      mlBuscarDescricao(representante.id, ctx),
      buscarAtributosFaltando(representante, ctx, cacheAtributos),
      verificarTabelaMedidasFaltando(representante, sellerId),
      mlSugerirCategoria(representante.title, ctx),
      Promise.all(
        membros.map(async (m) => {
          const ladoCapa = menorLadoFotoMaxSize(m.pictures?.[0]?.max_size);
          return {
            itemId: m.id,
            tituloCompleto: m.title,
            quantidadeFotos: m.pictures?.length ?? 0,
            fotoBaixaResolucao: ladoCapa !== null && ladoCapa < MIN_LADO_FOTO_RECOMENDADO,
            fotoForaDoPadrao: proporcaoFotoRecomendada(m.pictures?.[0]?.max_size) === "fora_do_padrao",
            diasNoAr: m.diasNoAr,
            vendasTotais: m.sold_quantity,
            visitas30d: await mlBuscarVisitas30d(m.id, ctx),
          };
        })
      ),
    ]);

  // Só considera "provavelmente errada" quando a busca devolveu sugestão (lista não vazia)
  // e a categoria atual não aparece entre as 3 mais prováveis pro texto do título.
  const categoriaProvavelmenteErrada =
    categoriasSugeridas.length > 0 && !categoriasSugeridas.some((c) => c.categoryId === representante.category_id);

  const { semReforco: atributosSemReforcoTexto, conflitantes: atributosConflitantes } = atributosSemReforcoNoTexto(
    atributosFaltando.preenchidos,
    `${representante.title} ${descricao}`
  );

  return {
    chave,
    itemIdRepresentante: representante.id,
    familiaNome: representante.family_name ?? null,
    tituloExemplo: representante.title,
    descricaoResumo: descricao.slice(0, 400),
    preco: representante.price,
    atributosPrincipaisFaltando: atributosFaltando.principais,
    atributosSecundariosFaltando: atributosFaltando.secundarios,
    tabelaMedidasFaltando,
    categoriaProvavelmenteErrada,
    categoriaSugeridaNome: categoriaProvavelmenteErrada ? (categoriasSugeridas[0]?.categoryName ?? null) : null,
    duplicidade: null,
    atributosSemReforcoTexto,
    atributosConflitantes,
    membros: membrosContexto,
  };
}

export async function buscarDadosAnunciosSeo(sellerId: string): Promise<AnuncioSeoContexto[]> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return [];

  const ids = await mlBuscarItensAtivos(ctx, 100);
  if (ids.length === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(ids, ctx);
  const agora = Date.now();
  const elegiveis: ItemComDias[] = detalhes
    .map((d) => ({ ...d, diasNoAr: Math.floor((agora - new Date(d.start_time).getTime()) / (1000 * 60 * 60 * 24)) }))
    .filter((d) => d.diasNoAr >= DIAS_MINIMOS_NO_AR);

  const todosGrupos = agruparPorFamilia(elegiveis).map((g) => ({
    ...g,
    vendasTotalGrupo: g.membros.reduce((s, m) => s + m.sold_quantity, 0),
  }));

  // Compara título entre TODOS os grupos ativos buscados, não só a amostra de 20 piores
  // abaixo — o par forte de um duplicado costuma vender bem e ficaria fora dessa amostra.
  const duplicidadePorChave = detectarDuplicados(todosGrupos);

  const { data: ultimaRow } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("resultado, executado_em")
    .eq("seller_id", sellerId)
    .eq("gestor", "anuncios_seo")
    .eq("status", "ok")
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimaChecagemPorChave =
    ultimaRow?.resultado && ultimaRow.executado_em
      ? mapaVendasPorChave(
          (ultimaRow.resultado as { anuncios?: AnuncioResultadoAnteriorMinimo[] }).anuncios ?? [],
          ultimaRow.executado_em
        )
      : new Map<string, UltimaChecagemGrupo>();

  // Não gasta IA de novo com grupo que já foi checado há pouco e nem vendeu nada desde
  // então — se TUDO estiver nessa situação, a lista fica vazia de propósito (é o ponto da
  // economia: nada mudou, não vale rodar a IA de novo). O chamador decide a mensagem.
  const candidatosComMudanca = todosGrupos.filter(
    (g) => !grupoFoiCheckadoRecentementeSemMudanca(g.vendasTotalGrupo, ultimaChecagemPorChave.get(g.chave))
  );

  const grupos = [...candidatosComMudanca].sort((a, b) => a.vendasTotalGrupo - b.vendasTotalGrupo).slice(0, MAX_CANDIDATOS);

  const cacheAtributos = new Map<string, MercadoLivreAtributoCategoria[]>();
  const contexto: AnuncioSeoContexto[] = [];
  for (const grupo of grupos) {
    const c = await montarContextoGrupo(grupo.chave, grupo.membros, ctx, sellerId, cacheAtributos);
    contexto.push({ ...c, duplicidade: duplicidadePorChave.get(grupo.chave) ?? null });
  }
  return contexto;
}

/** Busca dado de 1 anúncio específico (não amostra) — usado pela análise sob demanda a
 * partir do handoff do Gestor 1 ("veja esse anúncio"). Sempre grupo de 1, mesmo que o
 * anúncio pertença a uma família — é uma consulta pontual sobre um item, não a rodada
 * inteira da família. */
export async function buscarDadosAnuncioUnico(
  sellerId: string,
  itemId: string
): Promise<AnuncioSeoContexto | null> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return null;

  const detalhes = await mlBuscarItensDetalhe([itemId], ctx);
  const item = detalhes[0];
  if (!item) return null;

  const agora = Date.now();
  const itemComDias: ItemComDias = {
    ...item,
    diasNoAr: Math.floor((agora - new Date(item.start_time).getTime()) / (1000 * 60 * 60 * 24)),
  };
  return montarContextoGrupo(itemId, [itemComDias], ctx, sellerId, new Map());
}

export type SkuSemAnuncioSugestao = {
  sku: string;
  nomeProduto: string;
  custo: number;
  precoAncoraSugerido: number;
};

/** Preço-âncora do produto novo (pedido do Sr Stark, 2026-08-29): custo × 3 (200% de
 * markup) por padrão — dá espaço pro Ulisses trabalhar depois com ads/cupom/afiliado sem
 * precisar reeditar o preço a cada campanha. Cálculo puro (não pedido pra IA), mesmo
 * princípio de `fotos_insuficientes`/`dias_ate_ruptura` nos outros gestores. NÃO cria
 * anúncio nenhum — isso ainda depende do Andrey ganhar "criar anúncio do zero" (categoria +
 * atributos obrigatórios, nunca testado), fora do escopo aqui. Isso é só a sugestão de
 * preço, pro seller levar em conta quando for publicar manualmente. */
const MULTIPLICADOR_PRECO_ANCORA_PADRAO = 200;

/** SKU ativo do fornecedor vinculado ao seller que ainda não tem vínculo com nenhum
 * anúncio no Mercado Livre (`seller_mercadolivre_sku_map`) — sinal que já existe de graça
 * (join por ausência), sem precisar de chamada nova na API do ML. */
export async function buscarSkusSemAnuncio(sellerId: string): Promise<SkuSemAnuncioSugestao[]> {
  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("org_id, fornecedor_id")
    .eq("id", sellerId)
    .maybeSingle();
  if (!sellerRow?.fornecedor_id) return [];

  const [{ data: skusRaw }, { data: mapeadosRaw }] = await Promise.all([
    supabaseAdmin
      .from("skus")
      .select("sku, nome_produto, custo_base, custo_dropcore")
      .eq("org_id", sellerRow.org_id)
      .eq("fornecedor_id", sellerRow.fornecedor_id)
      .ilike("status", "ativo"),
    supabaseAdmin.from("seller_mercadolivre_sku_map").select("sku").eq("seller_id", sellerId),
  ]);

  const skusMapeados = new Set((mapeadosRaw ?? []).map((m) => m.sku as string));
  const skusAtivos = (skusRaw ?? []) as {
    sku: string;
    nome_produto: string | null;
    custo_base: number | null;
    custo_dropcore: number | null;
  }[];

  const semAnuncio: SkuSemAnuncioSugestao[] = [];
  for (const sku of skusAtivos) {
    if (skusMapeados.has(sku.sku)) continue;
    // Fonte única do "custo que o seller paga" (mesma usada em api/seller/produtos).
    const custo = sellerCustoTotalPagoUnitario(sku.custo_base, sku.custo_dropcore) ?? 0;
    if (custo <= 0) continue;
    semAnuncio.push({
      sku: sku.sku,
      nomeProduto: sku.nome_produto ?? sku.sku,
      custo,
      precoAncoraSugerido: calcularPrecoAncora(custo, MULTIPLICADOR_PRECO_ANCORA_PADRAO),
    });
  }
  return semAnuncio;
}

function formatarAtributoFaltando(a: AtributoFaltando): string {
  if (a.valueType === "list") {
    return `${a.name} (escolha exatamente um destes valores: ${a.valoresPermitidos.join(" | ")})`;
  }
  return `${a.name} (texto livre)`;
}

function formatarAnunciosSeo(grupos: AnuncioSeoContexto[]): string {
  return grupos
    .map((g) => {
      const familia =
        g.membros.length > 1
          ? `família "${g.familiaNome ?? g.chave}" com ${g.membros.length} variações`
          : "anúncio único (sem família)";
      const principais =
        g.atributosPrincipaisFaltando.length > 0
          ? ` | características principais vazias: ${g.atributosPrincipaisFaltando.map(formatarAtributoFaltando).join("; ")}`
          : "";
      const secundarios =
        g.atributosSecundariosFaltando.length > 0
          ? ` | características secundárias vazias: ${g.atributosSecundariosFaltando.map(formatarAtributoFaltando).join("; ")}`
          : "";
      const guiaMedidas = g.tabelaMedidasFaltando
        ? " | guia de tamanhos: existe tabela de medida cadastrada mas não está anexada no anúncio"
        : "";
      const categoriaAlerta = g.categoriaProvavelmenteErrada
        ? ` | ALERTA: a busca de categoria do próprio marketplace pelo título sugere "${g.categoriaSugeridaNome}", diferente da categoria atual do anúncio`
        : "";
      const semReforco =
        g.atributosSemReforcoTexto.length > 0
          ? ` | características preenchidas mas cujo valor não aparece no título nem na descrição: ${g.atributosSemReforcoTexto.map((a) => `${a.name}="${a.valor}"`).join("; ")}`
          : "";
      const conflitantes =
        g.atributosConflitantes.length > 0
          ? ` | CONFLITO ficha técnica vs texto (NÃO sugira trocar cego — mencione a divergência na observação pro vendedor conferir qual valor está certo): ${g.atributosConflitantes.map((a) => `${a.name}: ficha diz "${a.valor}", mas título/descrição já diz "${a.valorNoTexto}"`).join("; ")}`
          : "";
      const repeticoesTxt =
        g.perguntaReforcaGap && g.perguntaReforcaGap.repeticoes > 0
          ? ` (e já apareceu em mais ${g.perguntaReforcaGap.repeticoes} rodada(s) anterior(es) — não é só hoje, é recorrente)`
          : "";
      const perguntaTxt = g.perguntaReforcaGap
        ? ` | PERGUNTA PENDENTE DE COMPRADOR reforça esse gap: comprador perguntou "${g.perguntaReforcaGap.pergunta}" sobre o anúncio ${g.perguntaReforcaGap.itemId}, relacionado a "${g.perguntaReforcaGap.gap}"${repeticoesTxt}`
        : "";
      // Só menciona a reclamação quando (a) o código começa com "PDD" (Produto com Defeito/
      // Diferente, classificação oficial do ML pelos 3 primeiros caracteres do reason_id) E
      // (b) o triage do próprio ML não marca como arrependimento ("repentant") — testado ao
      // vivo 2026-10-17: o código real dessa conta de teste (PDD9939) começa com "PDD" mas
      // `rules_engine_triage` é `["repentant"]` ("A minha compra chegou em boas condições,
      // mas eu não a quero mais") — o prefixo sozinho NÃO bastava, teria mencionado uma
      // reclamação de arrependimento como se fosse problema de anúncio. "PNR" (não recebido,
      // é frete/logística) e "CS" (cancelamento) continuam fora por não terem nada a ver com
      // conteúdo — isso o SAC (reputação) já mostra melhor, com o motivo completo.
      const reclamacaoEhSobreConteudo =
        g.reclamacaoAbertaCodigo?.startsWith("PDD") === true && !(g.reclamacaoAbertaTriage ?? []).includes("repentant");
      const reclamacaoTxt = reclamacaoEhSobreConteudo
        ? g.reclamacaoAbertaMotivo
          ? ` | este grupo tem reclamação pós-venda em aberto sobre o produto em si, motivo real do comprador: "${g.reclamacaoAbertaMotivo}" — mencione na observação se fizer sentido`
          : ` | este grupo tem reclamação pós-venda em aberto sobre o produto em si (código Mercado Livre: ${g.reclamacaoAbertaCodigo}, motivo não resolvido) — mencione na observação se fizer sentido, sem inventar o motivo exato a partir do código`
        : "";
      const membrosTxt = g.membros
        .map((m) => {
          const zeroVisitas = m.visitas30d === 0 ? " [ZERO VISITAS — possível problema de indexação/categoria, não necessariamente de texto]" : "";
          return `  · ${m.itemId}: "${m.tituloCompleto}" (${m.vendasTotais} vendas, ${m.visitas30d} visitas 30d, ${m.diasNoAr}d no ar)${zeroVisitas}`;
        })
        .join("\n");
      return (
        `- ${g.chave} [${familia}]\n` +
        `  título de referência: "${g.tituloExemplo}" | preço R$ ${g.preco.toFixed(2)}${principais}${secundarios}${guiaMedidas}${categoriaAlerta}${semReforco}${conflitantes}${perguntaTxt}${reclamacaoTxt}\n` +
        `  descrição atual (resumo): "${g.descricaoResumo || "(sem descrição)"}"\n` +
        `  variações:\n${membrosTxt}`
      );
    })
    .join("\n\n");
}

export const PROMPT_ANUNCIOS_SEO: PromptTemplate<AnuncioSeoContexto[]> = {
  id: "anuncios_seo_diagnostico",
  gestor: "anuncios_seo",
  titulo: "Diagnóstico de Anúncios & SEO",
  persona:
    "Você é um especialista em SEO e otimização de anúncio de marketplace, focado em título, " +
    "descrição e ficha técnica (características principais e secundárias) que aumentam visita e " +
    "conversão orgânica. Você tem acesso a busca real na internet (ferramenta web_search) — USE ela " +
    "antes de sugerir um novo título pra um grupo com problema de título. Nunca monte o título só " +
    "reformatando/concatenando os atributos da ficha técnica na ordem que vierem; pesquise como " +
    "compradores reais buscam esse tipo de produto e quais termos têm mais volume de busca real, e use " +
    "isso pra decidir o que entra no título e em que ordem.",
  tarefa: [
    "Cada linha do contexto é um GRUPO — uma família de variações (mesmo produto em cores/tamanhos " +
      "diferentes, cada variação é um anúncio próprio no marketplace) ou um anúncio único sem família. " +
      "Avalie o grupo como um todo: o título, a descrição ou a ficha técnica incompleta (características " +
      "vazias, listadas no contexto) parecem estar prejudicando a performance (poucas visitas ou vendas " +
      "considerando o tempo no ar das variações)?",
    "Fotos NÃO fazem parte da sua avaliação — isso é conferido separadamente por contagem, fora do seu escopo.",
    "Características principais vazias pesam mais que secundárias vazias — a busca e os filtros do " +
      "marketplace dependem muito mais delas.",
    "Se o contexto disser que existe guia de tamanhos cadastrado mas não anexado no anúncio, isso " +
      "também conta como característica incompleta — mencione isso especificamente na observação, " +
      "é uma causa comum de devolução por tamanho errado.",
    "Se uma variação estiver marcada como [ZERO VISITAS], considere que o problema pode ser de " +
      "indexação/categoria (o marketplace nem está mostrando o anúncio na busca), não de título ou " +
      "descrição fracos — não classifique como 'sem problema aparente' só porque o texto está bom; " +
      "mencione essa suspeita na observação.",
    "Se o grupo tiver o ALERTA de categoria (a busca do próprio marketplace pelo título sugere uma " +
      "categoria diferente da atual), isso é o sinal mais forte de todos — priorize mencionar isso na " +
      "observação antes de sugerir ajuste de título/descrição, porque categoria errada anula o efeito " +
      "de qualquer melhoria de texto.",
    "Se o contexto listar características preenchidas cujo valor não aparece no título nem na descrição, " +
      "isso é evidência concreta de problema de descrição (ou de título, se o valor for algo que deveria " +
      "estar no título, como gênero ou tipo de produto) — a ficha técnica alimenta o filtro de busca do " +
      "marketplace, mas é o título/descrição que o buscador indexa por palavra-chave livre; os dois " +
      "precisam reforçar o mesmo dado. Use isso como base real pra sugerir texto que incorpore esses " +
      "valores, em vez de só opinar sobre o estilo do texto.",
    "Se o contexto listar CONFLITO ficha técnica vs texto, isso é diferente de característica ausente — " +
      "o título/descrição já tem uma resposta pra esse atributo, só que diferente da ficha técnica (ex.: " +
      "ficha diz 'Gola: Mao', título já diz 'Gola Padre'). Você não sabe qual dos dois está certo — NUNCA " +
      "troque o valor do título pelo da ficha técnica só porque ela está preenchida; isso pode trocar um " +
      "dado correto por um errado. Em vez disso, mencione a divergência na observação (ex.: \"a ficha " +
      "técnica diz Gola: Mao mas o título já diz Padre — confira qual está certo antes de mudar\") e NÃO " +
      "inclua esse atributo no título ou descrição sugeridos.",
    "Se o contexto tiver uma PERGUNTA PENDENTE DE COMPRADOR reforçando um gap, é evidência real (não " +
      "suposição sua) de que um comprador está pedindo essa informação agora — cite isso na observação " +
      "como prova concreta do problema, com prioridade sobre outros sinais mais fracos.",
    "Se o contexto mencionar reclamação pós-venda em aberto nesse grupo, considere isso como sinal " +
      "adicional de risco, mas NÃO invente qual é o motivo exato a partir só do código do Mercado Livre — " +
      "mencione que existe reclamação em aberto de forma genérica, sem afirmar a causa.",
    "Classifique cada grupo em: problema de título, problema de descrição, características incompletas, " +
      "sem problema aparente.",
    "Para grupo com problema de título: antes de escrever, faça pelo menos 1 busca real na internet sobre " +
      "esse tipo de produto específico (não genérico) pra ver que termos compradores reais usam e em que " +
      "ordem — não existe atalho sem pesquisar. Se ele tiver mais de 1 variação (família), sugira um " +
      "TÍTULO BASE sem cor nem tamanho específico — cada variação vai completar cor/tamanho ao aplicar, " +
      "o Mercado Livre não permite editar título de uma variação sem afetar a família toda. Se for " +
      "anúncio único, sugira o título completo normalmente.",
    "Para grupo com problema de descrição, escreva uma descrição melhorada completa (não só um resumo " +
      "do problema) — ela é aplicada literalmente em todas as variações do grupo, então não pode " +
      "mencionar cor/tamanho específico, tem que servir pra qualquer variação da família.",
    "Para grupo com características incompletas, preencha caracteristicas_sugeridas com um valor pra " +
      "cada característica vazia listada (principal e secundária) que você conseguir inferir com " +
      "segurança do título/descrição atuais (ex.: gênero pela palavra 'masculina'/'feminina' no título). " +
      "Quando a característica disser 'escolha exatamente um destes valores', use exatamente um nome " +
      "da lista, sem alterar a escrita — nunca invente um valor fora da lista. Quando disser 'texto " +
      "livre', pode escrever um valor coerente com o produto. Se não conseguir inferir com segurança " +
      "(não tem base nenhuma no título/descrição), não inclua essa característica em caracteristicas_sugeridas.",
  ],
  restricoes: [
    "Nunca invente característica, material ou benefício do produto que não esteja na descrição " +
      "ou no título de referência — só reorganizar/destacar o que já existe.",
    "Título sugerido tem que ser curto (até 60 caracteres) — título longo é cortado nos " +
      "resultados de busca do marketplace.",
    "Não avalie nem comente preço — isso é responsabilidade de outro gestor, que considera " +
      "custo e margem antes de opinar sobre valor.",
    "Isso é sugestão pro seller revisar e decidir se aplica — nunca afirme que o anúncio já foi " +
      "alterado.",
    "titulo_sugerido só quando o diagnóstico for problema de título; descricao_sugerida só quando " +
      "for problema de descrição; caracteristicas_sugeridas só quando for características incompletas " +
      "— nos outros casos, deixe vazio (string vazia ou array vazio).",
    "observacao tem que ser curta e direta — o catálogo pode ter vários grupos analisados de uma vez. " +
      "descricao_sugerida pode ser mais longa (é o texto final, não um resumo), mas sem enrolação.",
  ],
  formatoSaida: [
    "Tabela: Grupo | Diagnóstico | Título sugerido | Descrição sugerida | Observação",
    "Bloco final: os grupos que mais valem a pena revisar primeiro.",
  ].join("\n"),
  montarContexto: (grupos) =>
    `Meus anúncios ativos, agrupados por família de variação (amostra com pior venda, 30+ dias no ar):\n${formatarAnunciosSeo(grupos)}`,
};

export const SCHEMA_ANUNCIOS_SEO = {
  type: "object",
  properties: {
    anuncios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chave: { type: "string" },
          diagnostico: {
            type: "string",
            enum: ["problema_titulo", "problema_descricao", "caracteristicas_incompletas", "sem_problema_aparente"],
          },
          titulo_sugerido: { type: "string", maxLength: 70 },
          descricao_sugerida: { type: "string", maxLength: 1500 },
          caracteristicas_sugeridas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                atributo_id: { type: "string" },
                valor: { type: "string" },
              },
              required: ["atributo_id", "valor"],
              additionalProperties: false,
            },
          },
          observacao: { type: "string", maxLength: 140 },
        },
        required: [
          "chave",
          "diagnostico",
          "titulo_sugerido",
          "descricao_sugerida",
          "caracteristicas_sugeridas",
          "observacao",
        ],
        additionalProperties: false,
      },
    },
    destaque_prioridade: {
      type: "array",
      items: { type: "string" },
      description: "chaves de grupo (família ou anúncio único) que mais valem a pena revisar primeiro.",
    },
  },
  required: ["anuncios", "destaque_prioridade"],
  additionalProperties: false,
} as const;

// --- Enriquecimento pós-IA (código puro, não pedido pro modelo) -----------------------

type Diagnostico = "problema_titulo" | "problema_descricao" | "caracteristicas_incompletas" | "sem_problema_aparente";

type CaracteristicaSugeridaIA = { atributo_id: string; valor: string };

type AnuncioResultadoIA = {
  chave: string;
  diagnostico: Diagnostico;
  titulo_sugerido: string;
  descricao_sugerida: string;
  caracteristicas_sugeridas: CaracteristicaSugeridaIA[];
  observacao: string;
};

// Testado ao vivo (2026-09-07): cogitei pular a IA pra grupo "estruturalmente limpo" (sem
// atributo faltando, categoria ok, todo mundo com visita) e assumir "sem problema
// aparente" — mas contra dado real, os 19 grupos da amostra vieram TODOS estruturalmente
// limpos, e mesmo assim a IA encontrou "problema_descricao" em 9 deles. Diferente do
// Ulisses/Diogo/Amanda, qualidade de título/descrição exige ler o texto — não tem sinal
// estrutural que substitua isso com segurança. Não existe atalho aqui sem perder qualidade
// de verdade; revertido, esse gestor continua 100% dependente da IA.

export type MembroResultadoEnriquecido = {
  item_id: string;
  titulo_completo: string;
  vendas_totais: number;
  visitas_30d: number;
  dias_no_ar: number;
  /** Calculado por código (contagem de fotos < MIN_FOTOS_RECOMENDADO), não pedido pra IA. */
  fotos_insuficientes: boolean;
  /** Foto de capa abaixo da resolução mínima recomendada — sinal separado de "poucas fotos". */
  foto_baixa_resolucao: boolean;
  /** Foto de capa fora das duas proporções que o ML recomenda (quadrada 1:1 ou vertical
   * 4:5) — sinal separado de resolução baixa, ver `fotoForaDoPadrao`. */
  foto_fora_do_padrao: boolean;
};

export type ResultadoAcaoAnterior = {
  acao: string;
  quando: string;
  visitas_antes: number;
  visitas_depois: number;
  vendas_antes: number;
  vendas_depois: number;
};

export type CaracteristicaSugeridaEnriquecida = {
  atributo_id: string;
  atributo_nome: string;
  valor: string;
  /** false quando o atributo é de lista fechada e o valor da IA não bate exato com nenhuma
   * opção real — bloqueia "aplicar" pra esse item específico (defesa em profundidade, além
   * da instrução do prompt). Texto livre é sempre válido. */
  valorValido: boolean;
};

export type AnuncioResultadoEnriquecido = Omit<AnuncioResultadoIA, "caracteristicas_sugeridas"> & {
  item_id_representante: string;
  familia_nome: string | null;
  sinalizado_rodada_anterior: boolean;
  /** Passa direto do contexto (não pedido pra IA) — usado pro checklist de ficha técnica na tela. */
  atributos_principais_faltando: string[];
  atributos_secundarios_faltando: string[];
  caracteristicas_sugeridas: CaracteristicaSugeridaEnriquecida[];
  membros: MembroResultadoEnriquecido[];
  /** Sinal determinístico (não pedido pra IA): busca de categoria do marketplace pelo título
   * não bateu com a categoria atual do anúncio. */
  categoria_provavelmente_errada: boolean;
  categoria_sugerida_nome: string | null;
  /** Sinal determinístico (comparação de título entre famílias ativas do seller, não pedido
   * pra IA): esse grupo parece duplicado de outro anúncio ativo com mais venda. */
  duplicidade: DuplicidadeAnuncio | null;
  /** Sinal determinístico (não pedido pra IA): característica já preenchida cujo valor não
   * aparece no título nem na descrição — ver `atributosSemReforcoNoTexto`. */
  atributos_sem_reforco_texto: AtributoPreenchido[];
  /** Sinal determinístico (não pedido pra IA): ficha técnica tem um valor pra esse atributo
   * que não aparece no texto, mas outro valor válido do mesmo atributo JÁ aparece — ficha e
   * texto discordam (ex.: ficha diz "Gola: Mao", título já diz "Gola Padre"). Ver
   * `atributosSemReforcoNoTexto`. */
  atributos_conflitantes: AtributoConflitante[];
  /** Preenchido só quando uma ação (aplicar título/descrição/características) foi executada
   * de verdade nesse grupo desde a rodada anterior — compara visita/venda antes vs. depois
   * pra fechar o loop (a sugestão funcionou?). null quando nenhuma ação foi aplicada ainda. */
  resultado_acao_anterior: ResultadoAcaoAnterior | null;
};

export type ResultadoAnunciosSeoEnriquecido = {
  anuncios: AnuncioResultadoEnriquecido[];
  destaque_prioridade: string[];
  /** SKUs habilitados sem anúncio no ML ainda, com preço-âncora sugerido (custo × 3) —
   * cálculo puro, não vem da IA. Ver `buscarSkusSemAnuncio`. */
  skus_sem_anuncio: SkuSemAnuncioSugestao[];
};

/**
 * Roda depois que a Anthropic devolve o JSON: adiciona dado por variação (fotos, vendas,
 * visitas — cálculo puro, sem token) e compara com a rodada anterior por chave de grupo.
 * Rebusca o contexto fresco (não guarda o do submit — batch pode levar horas e a lista de
 * "20 piores grupos" pode ter mudado; só usa o que reaparecer pela mesma chave).
 */
export async function enriquecerResultadoAnunciosSeo(
  sellerId: string,
  resultadoIA: { anuncios: AnuncioResultadoIA[]; destaque_prioridade: string[] }
): Promise<ResultadoAnunciosSeoEnriquecido> {
  const [dadosContexto, skusSemAnuncio] = await Promise.all([
    buscarDadosAnunciosSeo(sellerId),
    buscarSkusSemAnuncio(sellerId),
  ]);
  const porChave = new Map(dadosContexto.map((d) => [d.chave, d]));

  const { data: anteriorRow } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("resultado, executado_em")
    .eq("seller_id", sellerId)
    .eq("gestor", "anuncios_seo")
    .eq("status", "ok")
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const problemaAnteriorPorChave = new Set<string>();
  const resultadoAnterior = anteriorRow?.resultado as {
    anuncios?: { chave: string; diagnostico: string; membros?: MembroResultadoEnriquecido[] }[];
  } | null;
  for (const a of resultadoAnterior?.anuncios ?? []) {
    if (a.diagnostico !== "sem_problema_aparente" && a.chave) problemaAnteriorPorChave.add(a.chave);
  }

  // Fecha o loop: se uma ação foi aplicada de verdade (título/descrição/características) desde
  // a última rodada, mostra visita/venda antes vs. depois pro seller ver se funcionou.
  const membrosAnteriorPorItemId = new Map<string, MembroResultadoEnriquecido>();
  for (const a of resultadoAnterior?.anuncios ?? []) {
    for (const m of a.membros ?? []) membrosAnteriorPorItemId.set(m.item_id, m);
  }
  const acoesPorItemId = new Map<string, { acao: string; criado_em: string }>();
  if (anteriorRow?.executado_em) {
    const { data: acoesRaw } = await supabaseAdmin
      .from("seller_ai_acoes")
      .select("alvo_id, acao, criado_em")
      .eq("seller_id", sellerId)
      .eq("gestor", "anuncios_seo")
      .eq("status", "executado")
      .gt("criado_em", anteriorRow.executado_em)
      .order("criado_em", { ascending: true });
    for (const row of acoesRaw ?? []) {
      acoesPorItemId.set(row.alvo_id, { acao: row.acao, criado_em: row.criado_em });
    }
  }

  const anuncios = resultadoIA.anuncios.map((a) => {
    const grupo = porChave.get(a.chave);
    const atributosDoGrupo = new Map(
      [...(grupo?.atributosPrincipaisFaltando ?? []), ...(grupo?.atributosSecundariosFaltando ?? [])].map((at) => [
        at.id,
        at,
      ])
    );
    const caracteristicasSugeridas: CaracteristicaSugeridaEnriquecida[] = (a.caracteristicas_sugeridas ?? [])
      .map((c) => {
        const atributo = atributosDoGrupo.get(c.atributo_id);
        if (!atributo) return null;
        const valorValido = atributo.valueType !== "list" || atributo.valoresPermitidos.includes(c.valor);
        return { atributo_id: c.atributo_id, atributo_nome: atributo.name, valor: c.valor, valorValido };
      })
      .filter((c): c is CaracteristicaSugeridaEnriquecida => c !== null);

    const itemIdsGrupo = (grupo?.membros ?? []).map((m) => m.itemId);
    const acoesDoGrupo = itemIdsGrupo
      .map((id) => acoesPorItemId.get(id))
      .filter((v): v is { acao: string; criado_em: string } => v !== undefined)
      .sort((x, y) => new Date(y.criado_em).getTime() - new Date(x.criado_em).getTime());

    let resultadoAcaoAnterior: ResultadoAcaoAnterior | null = null;
    if (acoesDoGrupo.length > 0) {
      const membrosAntes = itemIdsGrupo.map((id) => membrosAnteriorPorItemId.get(id)).filter((m) => m !== undefined);
      if (membrosAntes.length > 0) {
        resultadoAcaoAnterior = {
          acao: acoesDoGrupo[0].acao,
          quando: acoesDoGrupo[0].criado_em,
          visitas_antes: membrosAntes.reduce((s, m) => s + m.visitas_30d, 0),
          visitas_depois: (grupo?.membros ?? []).reduce((s, m) => s + m.visitas30d, 0),
          vendas_antes: membrosAntes.reduce((s, m) => s + m.vendas_totais, 0),
          vendas_depois: (grupo?.membros ?? []).reduce((s, m) => s + m.vendasTotais, 0),
        };
      }
    }

    return {
      ...a,
      item_id_representante: grupo?.itemIdRepresentante ?? a.chave,
      familia_nome: grupo?.familiaNome ?? null,
      sinalizado_rodada_anterior:
        a.diagnostico !== "sem_problema_aparente" && problemaAnteriorPorChave.has(a.chave),
      atributos_principais_faltando: (grupo?.atributosPrincipaisFaltando ?? []).map((at) => at.name),
      atributos_secundarios_faltando: (grupo?.atributosSecundariosFaltando ?? []).map((at) => at.name),
      caracteristicas_sugeridas: caracteristicasSugeridas,
      categoria_provavelmente_errada: grupo?.categoriaProvavelmenteErrada ?? false,
      categoria_sugerida_nome: grupo?.categoriaSugeridaNome ?? null,
      duplicidade: grupo?.duplicidade ?? null,
      atributos_sem_reforco_texto: grupo?.atributosSemReforcoTexto ?? [],
      atributos_conflitantes: grupo?.atributosConflitantes ?? [],
      resultado_acao_anterior: resultadoAcaoAnterior,
      membros: (grupo?.membros ?? []).map((m) => ({
        item_id: m.itemId,
        titulo_completo: m.tituloCompleto,
        vendas_totais: m.vendasTotais,
        visitas_30d: m.visitas30d,
        dias_no_ar: m.diasNoAr,
        fotos_insuficientes: m.quantidadeFotos < MIN_FOTOS_RECOMENDADO,
        foto_baixa_resolucao: m.fotoBaixaResolucao,
        foto_fora_do_padrao: m.fotoForaDoPadrao,
      })),
    };
  });

  return { anuncios, destaque_prioridade: resultadoIA.destaque_prioridade, skus_sem_anuncio: skusSemAnuncio };
}
