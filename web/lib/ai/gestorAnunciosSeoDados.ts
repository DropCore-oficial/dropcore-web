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
  diasNoAr: number;
  vendasTotais: number;
  visitas30d: number;
};

export type AtributoFaltando = {
  id: string;
  name: string;
  /** "list" = só aceita valor de `valoresPermitidos`; outros tipos aceitam texto livre. */
  valueType: string;
  valoresPermitidos: string[];
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
  membros: MembroAnuncioSeo[];
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

const DIAS_MINIMOS_NO_AR = 30;
const MAX_CANDIDATOS = 20;
/** Heurística simples pra "poucas fotos" — checagem por código, não pedida pra IA (não precisa de raciocínio, é contagem). */
const MIN_FOTOS_RECOMENDADO = 3;
/** ML recomenda foto quadrada com pelo menos 500px de lado pra boa visualização/zoom — usa
 * o menor lado de `max_size` (resolução original enviada) da foto de capa. */
const MIN_LADO_FOTO_RECOMENDADO = 500;

/** Cache por categoria — vários anúncios da amostra costumam repetir a mesma categoria, não
 * vale a pena buscar o schema de atributos de novo pra cada um. */
async function buscarAtributosFaltando(
  item: MercadoLivreItemDetail,
  ctx: MercadoLivreAuthContext,
  cache: Map<string, MercadoLivreAtributoCategoria[]>
): Promise<{ principais: AtributoFaltando[]; secundarios: AtributoFaltando[] }> {
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

  return {
    principais: obrigatoriosFaltando.filter((a) => a.relevance === 1),
    secundarios: obrigatoriosFaltando.filter((a) => a.relevance !== 1),
  };
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

type ItemComDias = MercadoLivreItemDetail & { diasNoAr: number };

/** Agrupa itens elegíveis por família (family_id) — item sem família vira grupo de 1, usando o próprio item_id como chave. */
function agruparPorFamilia(itens: ItemComDias[]): { chave: string; membros: ItemComDias[] }[] {
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

function detectarDuplicados(
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

  const grupos = [...todosGrupos].sort((a, b) => a.vendasTotalGrupo - b.vendasTotalGrupo).slice(0, MAX_CANDIDATOS);

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

/** SKU que o seller habilitou pra vender mas ainda não tem vínculo com nenhum anúncio no
 * Mercado Livre (`seller_mercadolivre_sku_map`) — sinal que já existe de graça (join por
 * ausência), sem precisar de chamada nova na API do ML. */
export async function buscarSkusSemAnuncio(sellerId: string): Promise<SkuSemAnuncioSugestao[]> {
  const [{ data: habilitadosRaw }, { data: mapeadosRaw }] = await Promise.all([
    supabaseAdmin
      .from("seller_skus_habilitados")
      .select("skus(sku, nome_produto, custo_base, custo_dropcore)")
      .eq("seller_id", sellerId),
    supabaseAdmin.from("seller_mercadolivre_sku_map").select("sku").eq("seller_id", sellerId),
  ]);

  const skusMapeados = new Set((mapeadosRaw ?? []).map((m) => m.sku as string));
  const habilitados = (habilitadosRaw ?? []) as unknown as {
    skus: { sku: string; nome_produto: string | null; custo_base: number | null; custo_dropcore: number | null } | null;
  }[];

  const semAnuncio: SkuSemAnuncioSugestao[] = [];
  for (const h of habilitados) {
    const sku = h.skus;
    if (!sku || skusMapeados.has(sku.sku)) continue;
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
      const membrosTxt = g.membros
        .map((m) => {
          const zeroVisitas = m.visitas30d === 0 ? " [ZERO VISITAS — possível problema de indexação/categoria, não necessariamente de texto]" : "";
          return `  · ${m.itemId}: "${m.tituloCompleto}" (${m.vendasTotais} vendas, ${m.visitas30d} visitas 30d, ${m.diasNoAr}d no ar)${zeroVisitas}`;
        })
        .join("\n");
      return (
        `- ${g.chave} [${familia}]\n` +
        `  título de referência: "${g.tituloExemplo}" | preço R$ ${g.preco.toFixed(2)}${principais}${secundarios}${guiaMedidas}${categoriaAlerta}\n` +
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
    "conversão orgânica.",
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
    "Classifique cada grupo em: problema de título, problema de descrição, características incompletas, " +
      "sem problema aparente.",
    "Para grupo com problema de título: se ele tiver mais de 1 variação (família), sugira um TÍTULO BASE " +
      "sem cor nem tamanho específico — cada variação vai completar cor/tamanho ao aplicar, o Mercado " +
      "Livre não permite editar título de uma variação sem afetar a família toda. Se for anúncio único, " +
      "sugira o título completo normalmente.",
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
      resultado_acao_anterior: resultadoAcaoAnterior,
      membros: (grupo?.membros ?? []).map((m) => ({
        item_id: m.itemId,
        titulo_completo: m.tituloCompleto,
        vendas_totais: m.vendasTotais,
        visitas_30d: m.visitas30d,
        dias_no_ar: m.diasNoAr,
        fotos_insuficientes: m.quantidadeFotos < MIN_FOTOS_RECOMENDADO,
        foto_baixa_resolucao: m.fotoBaixaResolucao,
      })),
    };
  });

  return { anuncios, destaque_prioridade: resultadoIA.destaque_prioridade, skus_sem_anuncio: skusSemAnuncio };
}
