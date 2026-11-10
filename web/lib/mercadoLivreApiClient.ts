/**
 * Cliente autenticado da API do Mercado Livre pro lado servidor (crons, gestores de IA).
 * Cuida de decriptar/renovar o token salvo em seller_mercadolivre_integrations — os jobs
 * batch (gestorAnunciosSeoDados.ts etc.) não sabem nada de OAuth, só chamam getValid... e
 * usam o token pronto.
 */
import { PDFDocument, degrees } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret, encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { refreshMercadoLivreAccessToken, computeMercadoLivreAccessTokenExpiresAt } from "@/lib/mercadoLivreOAuth";

const ML_API_BASE = "https://api.mercadolibre.com";

/** Monta o link público do anúncio a partir só do item_id, sem precisar buscar o
 * `permalink` real na API. Testado ao vivo: `produto.mercadolivre.com.br/{item_id}` sem
 * hífen dá "página não existe" — o formato mínimo que funciona e redireciona certo pro
 * anúncio de verdade é com hífen entre as letras e os números (ex. `MLB-4480111973`). */
export function mlItemPermalink(itemId: string): string {
  const match = itemId.match(/^([A-Za-z]+)(\d+)$/);
  const formatado = match ? `${match[1]}-${match[2]}` : itemId;
  return `https://produto.mercadolivre.com.br/${formatado}`;
}

/** Link direto pro dashboard de uma campanha de Ads específica dentro da Central de
 * Publicidade do vendedor — confirmado ao vivo (2026-09-03): clicar numa campanha na lista
 * (`.../product-ads/admin/campaigns?advertiser_id=...`) leva pra
 * `.../product-ads/admin/campaigns/{campaignId}/dashboard`. Só funciona logado como o
 * próprio seller (sessão de navegador), mesma categoria de link do `mlItemPermalink`. */
export function mlCampanhaAdsPermalink(campaignId: number | string): string {
  return `https://vendedores.mercadolivre.com.br/publicidade/product-ads/admin/campaigns/${campaignId}/dashboard`;
}

/** Link pra Central de promoções do vendedor já filtrada num item específico —
 * confirmado ao vivo (2026-09-06): `.../anuncios/lista/promos?search={item_id}` chega
 * direto no anúncio certo (precisa só expandir a linha pra ver a variação/SKU). Diferente
 * do `mlItemPermalink`, que manda pro PDP público — este é onde dá pra ver/mexer na
 * promoção ativa. Só funciona logado como o próprio seller. */
export function mlPromocaoItemPermalink(itemId: string): string {
  return `https://vendedores.mercadolivre.com.br/anuncios/lista/promos?search=${itemId}`;
}

/** Hub de Publicidade do vendedor — usado pra mandar o seller criar uma campanha nova na
 * mão (ver `sem_tracao_recriar`/`sugestao_primeira_campanha` em gestorAdsDados.ts). Não
 * linka direto pro assistente de criação porque esse fluxo pede `advertiser_id`/
 * `account_id` específicos da conta e passa por telas que exigem escolher o anúncio
 * manualmente de qualquer forma — o hub é o link estável que sempre funciona logado como o
 * próprio seller (achado ao vivo 2026-09-21: inspecionando o assistente de criar campanha,
 * as chamadas de sugestão de orçamento/ROAS vão pra um BFF interno `pa.mercadolivre.com.br`,
 * não pra API pública — não dá pra criar a campanha automaticamente, só apontar pro seller
 * ir lá). **Correção 2026-09-22**: `/publicidade` sozinho redireciona pro "Resumo" (não
 * chega na tela de Publicidade) — confirmado ao vivo navegando pelo menu do próprio painel
 * do seller (Djulios) que o link real é `/publicidade/resumo-anunciante`, que já chega com
 * o botão "Criar campanha" visível no topo. */
export function mlPublicidadeHubPermalink(): string {
  return "https://vendedores.mercadolivre.com.br/publicidade/resumo-anunciante";
}

/** Converte ACOS objetivo (%) pro ROAS objetivo equivalente que a tela do ML mostra desde
 * 15/out/2025 (trocaram o campo principal da UI de ACOS pra ROAS, mesmo a API ainda
 * devolvendo `acos_target` — ver memória de projeto). ROAS = 100/ACOS. Arredonda pra 1 casa
 * pra bater com o step que a tela usa (5x, 6x, 10x...). */
export function roasObjetivoEquivalente(acosPct: number): number {
  return Math.round((100 / acosPct) * 10) / 10;
}

/** Link direto pra tela de mediação/reclamação dentro da Central de Vendedores — achado
 * ao vivo (2026-08-25), navegando manualmente numa reclamação real. Só funciona pra quem
 * já está logado como aquele seller na conta do Mercado Livre (é onde ele consegue ver a
 * foto que o comprador anexou) — não serve pro admin nem pro fornecedor, só pro seller. */
export function mlReclamacaoPermalink(orderId: string, claimId: string): string {
  return `https://vendedores.mercadolivre.com.br/vendas/novo/mensagens/${orderId}/mediacao/${claimId}`;
}

export type MercadoLivreAuthContext = { accessToken: string; mlUserId: string };

/** Renova com 5min de folga antes do vencimento real, pra nunca usar um token na borda da expiração. */
const RENOVAR_ANTES_MS = 5 * 60 * 1000;

export async function getValidMercadoLivreAccessToken(
  sellerId: string
): Promise<MercadoLivreAuthContext | null> {
  const { data: linkRow, error: linkErr } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("linked_seller_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (linkErr) return null;

  // Conta demo compartilhada (ex: Segatto apontando pra conexão real do Galileus) — nunca
  // guarda token próprio, sempre lê/renova na linha dona de verdade (achado 2026-10-01: o
  // refresh_token do ML é de uso único, duplicar token em 2 linhas quebraria um dos dois
  // assim que o outro renovasse). Sem suporte a encadear 2 links — 1 nível só.
  const sellerIdDaConexao = linkRow?.linked_seller_id ?? sellerId;

  const { data: row, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token, ml_refresh_token, ml_access_token_expires_at")
    .eq("seller_id", sellerIdDaConexao)
    .maybeSingle();
  if (error || !row?.ml_access_token || !row.ml_user_id) return null;

  const expiraEm = row.ml_access_token_expires_at ? new Date(row.ml_access_token_expires_at).getTime() : 0;
  const precisaRenovar = !expiraEm || expiraEm - Date.now() < RENOVAR_ANTES_MS;

  if (!precisaRenovar) {
    return { accessToken: decryptSellerErpSecret(row.ml_access_token), mlUserId: row.ml_user_id };
  }

  if (!row.ml_refresh_token) return null;
  const refreshToken = decryptSellerErpSecret(row.ml_refresh_token);
  const tokens = await refreshMercadoLivreAccessToken(refreshToken);

  await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .update({
      ml_access_token: encryptSellerErpSecret(tokens.access_token),
      ml_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : row.ml_refresh_token,
      ml_access_token_expires_at: computeMercadoLivreAccessTokenExpiresAt(tokens.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("seller_id", sellerIdDaConexao);

  return { accessToken: tokens.access_token, mlUserId: row.ml_user_id };
}

async function mlGet<T>(path: string, accessToken: string): Promise<T | null> {
  const res = await fetch(`${ML_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** Igual `mlGet`, mas aceita headers extras — usada pela API de Ads, que exige
 * `api-version` (a de Publicidade descontinuou os endpoints antigos em 27/05/2026 e a
 * nova geração, baseada em `ad_group_id`, exige esse header). */
async function mlGetComHeaders<T>(
  path: string,
  accessToken: string,
  extraHeaders: Record<string, string>
): Promise<T | null> {
  const res = await fetch(`${ML_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type MercadoLivreItemSearchResult = { results: string[]; paging: { total: number } };

export async function mlBuscarItensAtivos(
  ctx: MercadoLivreAuthContext,
  limit = 100
): Promise<string[]> {
  const json = await mlGet<MercadoLivreItemSearchResult>(
    `/users/${ctx.mlUserId}/items/search?status=active&limit=${limit}`,
    ctx.accessToken
  );
  return json?.results ?? [];
}

/** Pagina até acabar o catálogo ativo — usado pelo sync do vínculo SKU↔item (precisa do
 * catálogo inteiro, diferente do gestor de Anúncios & SEO, que só olha uma amostra). */
export async function mlBuscarTodosItensAtivos(ctx: MercadoLivreAuthContext): Promise<string[]> {
  return mlBuscarTodosItensPorStatus(ctx, "active");
}

async function mlBuscarTodosItensPorStatus(ctx: MercadoLivreAuthContext, status: string): Promise<string[]> {
  const limit = 100;
  const ids: string[] = [];
  let offset = 0;
  while (true) {
    const json = await mlGet<MercadoLivreItemSearchResult>(
      `/users/${ctx.mlUserId}/items/search?status=${status}&limit=${limit}&offset=${offset}`,
      ctx.accessToken
    );
    const pagina = json?.results ?? [];
    ids.push(...pagina);
    if (pagina.length < limit || (json?.paging?.total ?? 0) <= ids.length) break;
    offset += limit;
  }
  return ids;
}

/** Igual `mlBuscarTodosItensAtivos`, mas inclui também os anúncios pausados — achado real
 * 2026-10-24: o ML pausa sozinho um anúncio quando `available_quantity` zera
 * (`sub_status: ["out_of_stock"]`, ver MercadoLivreItemDetail.status), e esse item some da
 * busca `status=active`. Pra quem só precisa descobrir "quem é o anúncio desse SKU" (sync
 * do vínculo SKU↔item), isso não importa: o vínculo deve existir mesmo com o anúncio
 * pausado, senão ele nunca é remapeado quando reabastecer. Usada só pelo sync de vínculo —
 * quem precisa listar "o que está realmente à venda agora" continua usando a versão só-ativa. */
export async function mlBuscarTodosItensAtivosEPausados(ctx: MercadoLivreAuthContext): Promise<string[]> {
  const [ativos, pausados] = await Promise.all([
    mlBuscarTodosItensPorStatus(ctx, "active"),
    mlBuscarTodosItensPorStatus(ctx, "paused"),
  ]);
  return [...new Set([...ativos, ...pausados])];
}

export type MercadoLivreAttribute = { id: string; value_name: string | null };

export type MercadoLivreVariation = {
  id: number;
  attribute_combinations?: MercadoLivreAttribute[];
  /** Atributos "extras" da variação (SELLER_SKU, MAIN_COLOR, etc) — diferente de
   * `attribute_combinations` (só os que definem a combinação, ex. cor/tamanho). Só vem
   * preenchido quando a chamada usa `include_attributes=all` (ver
   * mlBuscarItensDetalheComAtributosVariacao) — achado ao vivo 2026-09-28: o multiget
   * padrão (`mlBuscarItensDetalhe`) nunca traz este array, então SELLER_SKU de variação
   * nunca aparecia mesmo estando cadastrado de verdade no anúncio (falso positivo de
   * "anúncio sem SKU"). */
  attributes?: MercadoLivreAttribute[];
  /** Estoque e venda LIFETIME por variação (cor/tamanho) — confirmado ao vivo 2026-10-19
   * que esses dois campos JÁ vêm no multiget padrão (`mlBuscarItensDetalhe`), sem precisar
   * de `include_attributes=all` — só não eram lidos porque o tipo não os declarava. É o que
   * permite saber que uma variação específica esgotou mesmo com `available_quantity`
   * agregado do item inteiro ainda positivo (achado real: seller citou "G e GG de camisa
   * acabam, mas o anúncio mostra que tem estoque" — era a soma de todas as variações). */
  available_quantity?: number;
  sold_quantity?: number;
};

export type MercadoLivreItemDetail = {
  id: string;
  title: string;
  price: number;
  /** "active" | "paused" | "closed" | ... — achado ao vivo 2026-09-08: item some do
   * estoque (available_quantity 0) e o próprio ML pausa sozinho (`sub_status:
   * ["out_of_stock"]`). Não filtrar por isso faz gestor de preço/margem analisar anúncio
   * que nem está à venda. */
  status: string;
  /** Preço "de tabela" antes do desconto ativo — `null`/ausente quando o item não está em
   * nenhuma promoção que altera o preço de vitrine. Comparar com `price` pra saber o
   * desconto % real que está rodando agora (achado 2026-09-03: um SKU pode estar 49% OFF
   * sem que isso apareça em nenhum outro campo do item). */
  original_price?: number | null;
  /** URL real resolvida pelo próprio Mercado Livre pra essa variação específica do item —
   * preferir sempre este campo a `mlItemPermalink` (que só reconstrói um link genérico e,
   * quando o item pertence a um catálogo/família, pode cair numa página de catálogo com
   * outra variação pré-selecionada em vez da variação exata que está na promoção). */
  permalink?: string | null;
  available_quantity: number;
  sold_quantity: number;
  start_time: string;
  category_id: string;
  seller_id: number;
  listing_type_id?: string;
  /** `secure_url` confirmado ao vivo 2026-10-19 (já vem no multiget padrão, sem parâmetro
   * extra) — a URL https real da foto, usada pra análise de visão da Laura (gestor Design). */
  pictures?: { id: string; max_size?: string; secure_url?: string }[];
  attributes?: MercadoLivreAttribute[];
  variations?: MercadoLivreVariation[];
  family_id?: string | number | null;
  family_name?: string | null;
  /** `logistic_type: "fulfillment"` = Mercado Envios Full (estoque no centro de distribuição
   * do ML) — anúncio assim não pode ser pausado pelo fluxo manual normal (o ML controla o
   * envio); se pausado mesmo assim, estoque fica preso e ainda cobra taxa de "item parado".
   * `free_shipping: false` = frete cobrado do COMPRADOR, não do seller (ver `mlBuscarFreteReal`
   * — bug real encontrado 2026-09-28: o `list_cost` de `shipping_options` só é custo do seller
   * quando `free_shipping: true`). */
  shipping?: { logistic_type?: string; free_shipping?: boolean };
  /** IDs de promoção ativa no anúncio (ex. Oferta Relâmpago) — array vazio quando não tem
   * nenhuma rodando agora. */
  deal_ids?: string[];
};

/** `listing_type_id` do ML pro Mercado Livre Brasil: `gold_special` = Clássico,
 * `gold_pro` = Premium. Comissão default espelha `COMISSOES.meli_classico`/
 * `meli_premium` da calculadora (`web/app/seller/calculadora/page.tsx`) — mesmo valor,
 * mantido em paralelo por enquanto (a calculadora deixa o seller sobrescrever por
 * conta própria; aqui o Ulisses usa o default até ter um jeito de ler o valor
 * negociado do seller). */
export function mlComissaoPorListingType(listingTypeId: string | undefined): {
  tipo: "classico" | "premium" | "desconhecido";
  comissaoPct: number;
} {
  if (listingTypeId === "gold_pro") return { tipo: "premium", comissaoPct: 19 };
  if (listingTypeId === "gold_special") return { tipo: "classico", comissaoPct: 14 };
  return { tipo: "desconhecido", comissaoPct: 14 };
}

/** ML aceita até 20 ids por chamada no multiget — quem chama é responsável por dividir em lotes. */
export async function mlBuscarItensDetalhe(
  ids: string[],
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreItemDetail[]> {
  if (ids.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));

  const itens: MercadoLivreItemDetail[] = [];
  for (const lote of lotes) {
    const json = await mlGet<Array<{ code: number; body: MercadoLivreItemDetail }>>(
      `/items?ids=${lote.join(",")}`,
      ctx.accessToken
    );
    for (const entry of json ?? []) {
      if (entry.code === 200 && entry.body) itens.push(entry.body);
    }
  }
  return itens;
}

/** Igual a `mlBuscarItensDetalhe`, mas pede `include_attributes=all` — só assim
 * `variations[].attributes` vem preenchido (onde SELLER_SKU de variação realmente mora,
 * ver comentário em `MercadoLivreVariation`). Função separada de propósito: o multiget
 * padrão é usado por vários gestores que não precisam desse array extra; só o sync de
 * vínculo SKU↔anúncio (mercadoLivreSkuSync.ts) precisa da versão completa. */
export async function mlBuscarItensDetalheComAtributosVariacao(
  ids: string[],
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreItemDetail[]> {
  if (ids.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));

  const itens: MercadoLivreItemDetail[] = [];
  for (const lote of lotes) {
    const json = await mlGet<Array<{ code: number; body: MercadoLivreItemDetail }>>(
      `/items?ids=${lote.join(",")}&include_attributes=all`,
      ctx.accessToken
    );
    for (const entry of json ?? []) {
      if (entry.code === 200 && entry.body) itens.push(entry.body);
    }
  }
  return itens;
}

export async function mlBuscarDescricao(itemId: string, ctx: MercadoLivreAuthContext): Promise<string> {
  const json = await mlGet<{ plain_text?: string }>(`/items/${itemId}/description`, ctx.accessToken);
  return json?.plain_text?.trim() ?? "";
}

export async function mlBuscarVisitas30d(itemId: string, ctx: MercadoLivreAuthContext): Promise<number> {
  const json = await mlGet<{ total_visits?: number }>(
    `/items/${itemId}/visits/time_window?last=30&unit=day`,
    ctx.accessToken
  );
  return json?.total_visits ?? 0;
}

/** Visita real num período PASSADO arbitrário — diferente de `mlBuscarVisitas30d`
 * (`time_window`, sempre ancorado em "agora", só aceita janela relativa). Testado ao vivo
 * 2026-10-19 contra conta real: o endpoint `/items/{id}/visits` aceita `date_from`/`date_to`
 * de até 90 dias atrás sem problema — só que a data tem que ser `YYYY-MM-DD` (ISO completo
 * com hora/milissegundo dá 400 "unknown date format"). Isso permite comparar o tráfego de
 * HOJE com o de ~60-90 dias atrás sem esperar a própria conta acumular histórico salvo. */
export async function mlBuscarVisitasPeriodo(
  itemId: string,
  dateFrom: string,
  dateTo: string,
  ctx: MercadoLivreAuthContext
): Promise<number> {
  const json = await mlGet<{ total_visits?: number }>(
    `/items/${itemId}/visits?date_from=${dateFrom}&date_to=${dateTo}`,
    ctx.accessToken
  );
  return json?.total_visits ?? 0;
}

export type MercadoLivreReclamacao = {
  id: number;
  /** "order" ou "shipment" (ou outro raro) — determina como resolver o item por trás da
   * reclamação, ver `mlResolverItemPrincipalReclamacao`. */
  resource: string;
  resourceId: string;
  status: string;
  type: string;
  reasonId: string;
  dateCreated: string;
};

/** Reclamações/devoluções abertas onde o seller é o `respondent` — testado ao vivo
 * (2026-08-25): parâmetro certo é `player_role`/`player_user_id` (com underscore, a doc da
 * ML sugere ponto à primeira vista e devolve 400). Mesma conexão OAuth dos outros gestores,
 * sem escopo novo. */
export async function mlBuscarReclamacoesAbertas(
  ctx: MercadoLivreAuthContext,
  limit = 30
): Promise<MercadoLivreReclamacao[]> {
  const json = await mlGet<{
    data?: Array<{
      id: number;
      resource: string;
      resource_id: number | string;
      status: string;
      type: string;
      reason_id: string;
      date_created: string;
    }>;
  }>(
    `/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ctx.mlUserId}&status=opened&limit=${limit}`,
    ctx.accessToken
  );
  return (json?.data ?? []).map((c) => ({
    id: c.id,
    resource: c.resource,
    resourceId: String(c.resource_id),
    status: c.status,
    type: c.type,
    reasonId: c.reason_id,
    dateCreated: c.date_created,
  }));
}

/** Reclamações do seller SEM filtro de status, mais recentes primeiro — achado real
 * 2026-11-10: `mlBuscarReclamacoesAbertas` (status=opened) não vê devolução que o ML já
 * FECHOU com decisão a favor do comprador (`resolution.reason === "item_returned"`) mas
 * ainda tem ação obrigatória pendente pro vendedor (ex.: `return_review_ok`, prazo real) —
 * caso real do seller Coimbra Company, claim fechada 2 dias antes de eu notar manualmente.
 * Usada só pela varredura diária de segurança (`varrerDevolucoesMlTodosSellers`), não pelo
 * caminho de webhook em tempo real (esse continua em `mlBuscarReclamacoesAbertas`, mais
 * barato pra rodar a cada claim que chega). */
export async function mlBuscarReclamacoesRecentes(
  ctx: MercadoLivreAuthContext,
  limit = 50
): Promise<MercadoLivreReclamacao[]> {
  const json = await mlGet<{
    data?: Array<{
      id: number;
      resource: string;
      resource_id: number | string;
      status: string;
      type: string;
      reason_id: string;
      date_created: string;
    }>;
  }>(
    `/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ctx.mlUserId}&limit=${limit}&sort=date_created&sort_type=desc`,
    ctx.accessToken
  );
  return (json?.data ?? []).map((c) => ({
    id: c.id,
    resource: c.resource,
    resourceId: String(c.resource_id),
    status: c.status,
    type: c.type,
    reasonId: c.reason_id,
    dateCreated: c.date_created,
  }));
}

/** Status atual de 1 reclamação específica, direto na API (não a lista de "abertas") —
 * usado pra filtrar caso o ML já tenha fechado a reclamação depois que o caso foi gravado
 * em `seller_ai_disputas_fornecedor` (achado real 2026-10-01: reclamação fechada desde
 * 25/08 continuava aparecendo pro seller como pendente, e o link "Ver reclamação" quebra
 * no próprio Mercado Livre quando a reclamação já foi fechada). */
export async function mlReclamacaoAindaAberta(claimId: string, ctx: MercadoLivreAuthContext): Promise<boolean> {
  const json = await mlGet<{ status?: string }>(`/post-purchase/v1/claims/${claimId}`, ctx.accessToken);
  return json?.status === "opened";
}

/** Payload bruto completo de `/post-purchase/v1/claims/{id}` — usado só pra calibração
 * (ver mlDevolucaoCalibracaoLog.ts): nunca testamos contra um caso real se esse endpoint
 * expõe algum sinal de "devolução entregue no fornecedor" (shipment de volta, resolution,
 * etc) além de `status`/`available_actions`, já confirmados em 2026-08-25. */
export async function mlBuscarReclamacaoDetalheBruto(
  claimId: string,
  ctx: MercadoLivreAuthContext
): Promise<Record<string, unknown> | null> {
  return mlGet<Record<string, unknown>>(`/post-purchase/v1/claims/${claimId}`, ctx.accessToken);
}

/** Payload bruto completo de `/shipments/{id}` — mesma calibração acima, pro caso do
 * `resource` do claim ser "shipment" (ou pra inspecionar o shipment original do pedido). */
export async function mlBuscarShipmentDetalheBruto(
  shipmentId: string,
  ctx: MercadoLivreAuthContext
): Promise<Record<string, unknown> | null> {
  return mlGet<Record<string, unknown>>(`/shipments/${shipmentId}`, ctx.accessToken);
}

/** Payload bruto completo de `/orders/{id}` — mesma calibração acima, pra achar o
 * `shipping.id` do pedido quando o `resource` do claim é "order" (aí dá pra seguir pro
 * shipment de verdade via `mlBuscarShipmentDetalheBruto`). */
export async function mlBuscarOrderDetalheBruto(
  orderId: string,
  ctx: MercadoLivreAuthContext
): Promise<Record<string, unknown> | null> {
  return mlGet<Record<string, unknown>>(`/orders/${orderId}`, ctx.accessToken);
}

export type MercadoLivreMotivoReclamacao = {
  detail: string | null;
  /** Classificação própria do ML pro motivo (ex. `["repentant"]` pra arrependimento de
   * compra) — testado ao vivo 2026-10-17 com `PDD9939` ("A minha compra chegou em boas
   * condições, mas eu não a quero mais"): mesmo começando com `PDD` (categoria "produto
   * diferente/defeituoso"), o motivo real é arrependimento, nada a ver com o anúncio estar
   * errado. Esse campo é o sinal confiável pra distinguir os dois — melhor que só olhar o
   * prefixo do código. */
  rulesEngineTriage: string[];
};

/** Motivo humano (já em português) de um `reason_id` de reclamação pós-venda — endpoint
 * oficial testado ao vivo 2026-10-17. Resolve o que antes era tratado como "ML não
 * documenta esses códigos" (ver nota antiga em `gestorAnunciosSeoDados.ts`) — é dado real
 * da API, não dicionário inventado. */
export async function mlBuscarMotivoReclamacao(
  reasonId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreMotivoReclamacao | null> {
  const json = await mlGet<{ detail?: string; settings?: { rules_engine_triage?: string[] } }>(
    `/post-purchase/v1/claims/reasons/${reasonId}`,
    ctx.accessToken
  );
  if (!json) return null;
  return { detail: json.detail ?? null, rulesEngineTriage: json.settings?.rules_engine_triage ?? [] };
}

export type MercadoLivreEvidenciaAnexo = { filename: string; originalFilename: string; type: string; dateCreated: string };

/** Lista de evidência (foto/vídeo) anexada pelo comprador numa reclamação — testado ao vivo,
 * encontrou foto real num caso de teste. Endpoint de download do arquivo em si
 * (`/attachments/{filename}`) ainda não resolvido — devolveu 404 numa tentativa rápida,
 * fica pendente pra quando formos implementar a comparação visual de verdade. */
export async function mlBuscarEvidenciasReclamacao(
  claimId: number,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreEvidenciaAnexo[]> {
  const json = await mlGet<Array<{ attachments?: Array<{ filename: string; original_filename: string; type: string; date_created: string }> }>>(
    `/post-purchase/v1/claims/${claimId}/evidences`,
    ctx.accessToken
  );
  const anexos: MercadoLivreEvidenciaAnexo[] = [];
  for (const bloco of json ?? []) {
    for (const a of bloco.attachments ?? []) {
      anexos.push({ filename: a.filename, originalFilename: a.original_filename, type: a.type, dateCreated: a.date_created });
    }
  }
  return anexos;
}

export type MercadoLivrePedidoItemML = {
  itemId: string;
  titulo: string;
  atributos: { nome: string; valor: string }[];
};

/** Item id + título + atributos (cor/tamanho declarados) do primeiro item de um pedido —
 * usado pra dar contexto à IA na comparação da foto de evidência, e pro link "Ver anúncio"
 * (mlItemPermalink) na tela de disputa. */
export async function mlBuscarPedidoItemPrincipal(
  orderId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivrePedidoItemML | null> {
  const json = await mlGet<{
    order_items?: Array<{
      item: { id: string; title: string; variation_attributes?: Array<{ name: string; value_name: string }> };
    }>;
  }>(`/orders/${orderId}`, ctx.accessToken);
  const primeiro = json?.order_items?.[0]?.item;
  if (!primeiro) return null;
  return {
    itemId: primeiro.id,
    titulo: primeiro.title,
    atributos: (primeiro.variation_attributes ?? []).map((a) => ({ nome: a.name, valor: a.value_name })),
  };
}

/** Resolve o item/anúncio por trás de uma reclamação — o `resource_id` vem direto como
 * pedido (`resource: "order"`) em alguns tipos de claim (ex. mediations, returns) e como
 * envio (`resource: "shipment"`) em outros (ex. cancel_purchase) — testado ao vivo
 * 2026-10-17 nos dois formatos. Shipment precisa de 1 hop a mais em `/shipments/{id}` pra
 * achar o `order_id` (mesmo endpoint já usado em `mercadoLivreShipmentIngest.ts`). Resource
 * desconhecido (ex. "payment", raro) devolve `null` — não dá pra resolver item a partir só
 * de pagamento. */
export async function mlResolverItemPrincipalReclamacao(
  reclamacao: MercadoLivreReclamacao,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivrePedidoItemML | null> {
  if (reclamacao.resource === "order") {
    return mlBuscarPedidoItemPrincipal(reclamacao.resourceId, ctx);
  }
  if (reclamacao.resource === "shipment") {
    const json = await mlGet<{ order_id?: number | string | null }>(`/shipments/${reclamacao.resourceId}`, ctx.accessToken);
    const orderId = json?.order_id != null ? String(json.order_id) : null;
    if (!orderId) return null;
    return mlBuscarPedidoItemPrincipal(orderId, ctx);
  }
  return null;
}

export type MercadoLivreAtributoCategoria = {
  id: string;
  name: string;
  /** 1 = característica principal, 2 = secundária (confirmado testando a API — não é doc
   * oficial). Achado ao vivo 2026-10-06: `relevance` SOZINHA não distingue característica de
   * busca de metadado técnico (campo tipo SIZE_GRID_ID/PACKAGE_WEIGHT/VERTICAL_TAGS também
   * vem com relevance 1 ou 2) — quem distingue de verdade é `hidden` abaixo. */
  relevance: number;
  required: boolean;
  /** `tags.hidden` da API — true pra atributo técnico/interno do ML (peso de embalagem, ID
   * de guia de tamanhos, tags de sistema, "com provador virtual" etc.), nunca pensado como
   * palavra-chave de busca pro comprador. Confirmado ao vivo 2026-10-06 comparando atributo
   * por atributo (ver docs/SCHEMA.md) — BRAND/GENDER (reais) não têm essa tag; os técnicos
   * sempre têm. Usar isso, nunca `relevance`, pra filtrar o que conta como "ficha técnica
   * visível"/palavra-chave de verdade. */
  hidden: boolean;
  /** "list" = só aceita valor de `valoresPermitidos` (testado ao vivo: texto livre resolve certo quando
   * bate com uma opção, mas não testamos o que acontece quando não bate — mais seguro forçar escolha
   * dentre as opções reais). Outros tipos (ex. "string") aceitam texto livre. "grid_id"/"grid_row_id" são
   * referência a guia de tamanhos (ID técnico, não característica) — mesmo sem `hidden: true` em todo caso
   * (SIZE_GRID_ID não leva a tag), também tem que ser tratado como não-palavra-chave. */
  valueType: string;
  /** Nomes das opções válidas — só populado quando valueType === "list". */
  valoresPermitidos: string[];
  /** `tags.multivalued` da API — true pra atributo que aceita MAIS DE UM valor ao mesmo
   * tempo (ex.: Ocasiões, Estilos, no vestuário — o próprio ML mostra como checkbox de
   * múltipla escolha, não um select único). Sem esse flag, qualquer código que só aceite
   * um valor por atributo (ex.: sugestão de característica) trata esses campos errado. */
  multivalued: boolean;
  /** `value_max_length` da API — limite real de caracteres pro valor desse atributo (ex.: 255
   * pra MODEL na maioria das categorias). null quando o ML não informa um limite pra esse
   * atributo. Usar esse número real em vez de chutar um teto arbitrário no schema de IA. */
  valorMaxLength: number | null;
};

/** Endpoint público (não precisa token), mas reaproveita o mesmo client por consistência.
 * É o schema de atributos da categoria — não o item em si — por isso dá pra cachear por
 * category_id entre vários anúncios da mesma categoria numa mesma rodada. */
export async function mlBuscarAtributosCategoria(
  categoryId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreAtributoCategoria[]> {
  const json = await mlGet<
    Array<{
      id: string;
      name: string;
      relevance?: number;
      tags?: { required?: boolean; hidden?: boolean; multivalued?: boolean };
      value_type?: string;
      value_max_length?: number;
      values?: { name: string }[];
    }>
  >(`/categories/${categoryId}/attributes`, ctx.accessToken);
  return (json ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    relevance: a.relevance ?? 2,
    valorMaxLength: a.value_max_length ?? null,
    required: Boolean(a.tags?.required),
    hidden: Boolean(a.tags?.hidden),
    valueType: a.value_type ?? "string",
    valoresPermitidos: a.value_type === "list" ? (a.values ?? []).map((v) => v.name) : [],
    multivalued: Boolean(a.tags?.multivalued),
  }));
}

export type MercadoLivreCategoriaSugerida = { categoryId: string; categoryName: string };

/** Endpoint público de sugestão de categoria a partir de um texto de busca — testado ao
 * vivo (2026-08-24): aberto pra app de terceiro (não exige nada além do token de acesso),
 * e concorda com a categoria real em amostra de itens já bem categorizados (8/8 bateram).
 * Serve como sinal de "categoria pode estar errada" sem precisar de fonte de demanda nova. */
export async function mlSugerirCategoria(
  titulo: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreCategoriaSugerida[]> {
  const json = await mlGet<Array<{ category_id: string; category_name: string }>>(
    `/sites/MLB/domain_discovery/search?limit=3&q=${encodeURIComponent(titulo)}`,
    ctx.accessToken
  );
  return (json ?? []).map((s) => ({ categoryId: s.category_id, categoryName: s.category_name }));
}

/** Caminho completo da categoria (ex.: "Calçados, Roupas e Bolsas > Roupas Masculinas > " +
 * "Camisas") — achado ao vivo 2026-10-07: `domain_discovery/search` pode devolver duas ou
 * mais categorias com o MESMO nome curto (ex.: "Camisas" dentro de Masculino e dentro de
 * Feminino), impossível de diferenciar só pelo `category_name` isolado. Usar isso pra
 * mostrar o caminho inteiro em qualquer lista de categorias sugeridas pro usuário escolher. */
export async function mlBuscarCaminhoCategoria(categoryId: string, ctx: MercadoLivreAuthContext): Promise<string> {
  const json = await mlGet<{ path_from_root?: { name: string }[] }>(`/categories/${categoryId}`, ctx.accessToken);
  const caminho = json?.path_from_root?.map((p) => p.name) ?? [];
  return caminho.length > 0 ? caminho.join(" > ") : categoryId;
}

/** Menor lado (largura ou altura) da maior resolução disponível da foto (`max_size`,
 * formato "WxH") — usado pra sinalizar foto de baixa qualidade, não só contagem. Retorna
 * null quando o dado não vem (não bloqueia nada, só deixa de sinalizar). */
export function menorLadoFotoMaxSize(maxSize: string | undefined): number | null {
  if (!maxSize) return null;
  const match = maxSize.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return Math.min(Number(match[1]), Number(match[2]));
}

/** Proporção recomendada pelo próprio Mercado Livre (doc oficial pra desenvolvedores,
 * confirmado 2026-10-20): quadrada 1200×1200 (ativa o zoom, zoom já liga a partir de 800px
 * de largura) ou vertical ~1200×1540 (4:5, recomendada pra moda — preenche melhor a tela do
 * celular). `"fora_do_padrao"` quando a foto não bate com nenhuma das duas (nem quadrada nem
 * vertical) ou é estreita demais pra ativar o zoom — sinal de que pode estar sendo cortada/
 * mal exibida no feed mobile. Tolerância de ±5% no quadrado e a faixa 0.73-0.83 no vertical
 * (cobre o 4:5 exato = 0.8 e o 1200/1540 ≈ 0.779 citado no guia da categoria moda) — não
 * exige o pixel exato, ninguém bate 1200×1540 certinho na prática. */
export function proporcaoFotoRecomendada(maxSize: string | undefined): "quadrada" | "vertical" | "fora_do_padrao" | null {
  if (!maxSize) return null;
  const match = maxSize.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  const largura = Number(match[1]);
  const altura = Number(match[2]);
  if (largura < 800) return "fora_do_padrao";
  const razao = largura / altura;
  if (razao >= 0.95 && razao <= 1.05) return "quadrada";
  if (razao >= 0.73 && razao <= 0.83) return "vertical";
  return "fora_do_padrao";
}

export type MercadoLivreItemTituloEstado = {
  title: string;
  sold_quantity: number;
  family_name: string | null;
  seller_id: number;
};

/** Estado mínimo pra decidir se o título pode ser editado: o ML trava PUT title quando o
 * item tem família (variantes) OU já teve alguma venda (sold_quantity > 0) — confirmado
 * testando ao vivo, não é regra documentada claramente pelo ML. Inclui seller_id pra validar
 * dono do anúncio direto pela API do ML — não usar seller_mercadolivre_sku_map pra isso, a
 * cobertura dele é parcial (nem todo item tem SELLER_SKU preenchido). */
export async function mlBuscarItemTituloEstado(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivreItemTituloEstado | null> {
  return mlGet<MercadoLivreItemTituloEstado>(
    `/items/${itemId}?attributes=id,title,sold_quantity,family_name,seller_id`,
    ctx.accessToken
  );
}

export async function mlAtualizarTitulo(
  itemId: string,
  titulo: string,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: titulo }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, erro: json.message ?? json.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Escreve valor(es) de característica no anúncio. Testado ao vivo: pra atributo tipo "list"
 * (ex. GENDER), mandar value_name que bate exato com uma opção real resolve certo pro
 * value_id correspondente; pra tipo "string" (ex. BRAND, SHIRT_MATERIAL) aceita texto livre,
 * mesmo fora do catálogo do ML. Por isso quem chama essa função só deve mandar value_name
 * de lista fechada que já veio de `valoresPermitidos` — nunca um valor solto pra esse tipo. */
export async function mlAtualizarAtributos(
  itemId: string,
  atributos: { id: string; value_name?: string; value_id?: string }[],
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ attributes: atributos }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, erro: json.message ?? json.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Pausa/reativa o anúncio. Testado ao vivo (2026-08-22): funciona sem a trava de família/
 * venda do título — `status: "paused"` e depois `"active"` no mesmo item, ambos 200. */
export async function mlAtualizarStatus(
  itemId: string,
  status: "paused" | "active",
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, erro: json.message ?? json.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export type MercadoLivreEstoqueAtualizacao = { variationId: number; availableQuantity: number };

/** Escreve `available_quantity` no anúncio (`PUT /items/{id}`) — usada pelo sync direto de
 * estoque fornecedor→ML (ver sellerMercadoLivreSyncEstoque.ts). `variationId === 0` (sem
 * variação, ver ml_variation_id em seller_mercadolivre_sku_map) manda o campo no nível do
 * item; qualquer outro valor manda dentro de `variations`, que o ML trata como atualização
 * pontual daquela variação por `id` — não precisa (nem deve) mandar as outras variações do
 * mesmo anúncio que não mudaram. Agrupar por item_id é responsabilidade de quem chama. */
export async function mlAtualizarEstoque(
  itemId: string,
  atualizacoes: MercadoLivreEstoqueAtualizacao[],
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (atualizacoes.length === 0) return { ok: true };

  const semVariacao = atualizacoes.find((a) => a.variationId === 0);
  const comVariacao = atualizacoes.filter((a) => a.variationId !== 0);

  const body: Record<string, unknown> =
    comVariacao.length > 0
      ? { variations: comVariacao.map((a) => ({ id: a.variationId, available_quantity: Math.max(0, Math.floor(a.availableQuantity)) })) }
      : { available_quantity: Math.max(0, Math.floor(semVariacao?.availableQuantity ?? 0)) };

  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    cause?: { code?: string; message?: string }[];
  };
  if (!res.ok) {
    const causa = json.cause?.map((c) => c.message ?? c.code).filter(Boolean).join("; ");
    return { ok: false, erro: causa || json.message || json.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Atualiza o preço do anúncio (`PUT /items/{id}`). Usada pelo Ulisses pra aplicar o
 * "preço mínimo seguro" calculado (rota `ulisses-aplicar-preco-seguro`). Arredonda pra 2
 * casas antes de mandar — achado ao vivo (2026-09-06): o ML rejeita com "Max. decimal
 * precision allowed for currency Real (BRL) is 2" se o preço vier com mais casas (ex. de
 * uma rodada salva antes do cálculo já vir arredondado), e é barato garantir aqui também. */
export async function mlAtualizarPreco(
  itemId: string,
  preco: number,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const precoArredondado = Math.round(preco * 100) / 100;
  const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ price: precoArredondado }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    cause?: { code?: string; message?: string }[];
  };
  if (!res.ok) {
    const causa = json.cause?.map((c) => c.message ?? c.code).filter(Boolean).join("; ");
    return { ok: false, erro: causa || json.message || json.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}

const AGE_GROUP_FALTANDO_REGEX = /Attribute \[AGE_GROUP\][^(]*\((\d+)/;

/** Mesma coisa que `mlAtualizarPreco`, mas trata ao vivo (achado 2026-09-06, SKU DJU001036)
 * o bloqueio "Attribute [AGE_GROUP] to be added with values [(id,null)]" — o ML as vezes
 * exige esse atributo (faixa etária) preenchido antes de aceitar qualquer PUT no item, mas
 * ele é `hidden`/`read_only` na tela normal de edição, só dá pra corrigir via API. A própria
 * mensagem de erro já vem com o value_id certo pra usar — só precisa extrair e reenviar. */
export async function mlAtualizarPrecoSeguro(
  itemId: string,
  preco: number,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true; ageGroupCorrigido: boolean } | { ok: false; erro: string }> {
  const primeira = await mlAtualizarPreco(itemId, preco, ctx);
  if (primeira.ok) return { ok: true, ageGroupCorrigido: false };

  const match = primeira.erro.match(AGE_GROUP_FALTANDO_REGEX);
  if (!match) return primeira;

  const attrRes = await mlAtualizarAtributos(itemId, [{ id: "AGE_GROUP", value_id: match[1] }], ctx);
  if (!attrRes.ok) return { ok: false, erro: `${primeira.erro} (tentei corrigir AGE_GROUP e falhou: ${attrRes.erro})` };

  const segunda = await mlAtualizarPreco(itemId, preco, ctx);
  if (!segunda.ok) return segunda;
  return { ok: true, ageGroupCorrigido: true };
}

export type MercadoLivrePromocaoAtiva = {
  id: string;
  type: string;
  status: string;
  name?: string;
  start_date?: string;
  finish_date?: string;
  deadline_date?: string;
};

/** Promoções/campanhas ativas do seller (`seller-promotions`) — testado ao vivo
 * (2026-08-29) contra conta real: devolve LIGHTNING (oferta relâmpago, convite do ML),
 * SMART/DEAL (campanhas, também por convite) e, quando existir, SELLER_COUPON_CAMPAIGN
 * (cupom criado pelo próprio seller). Usado pelo Ulisses só pra diagnóstico nesta fase —
 * criar promoção nova é dinheiro real do seller, fica fora do escopo até aprovação
 * explícita (ver plano do gestor). */
export async function mlBuscarPromocoesAtivas(ctx: MercadoLivreAuthContext): Promise<MercadoLivrePromocaoAtiva[]> {
  const json = await mlGet<{ results: MercadoLivrePromocaoAtiva[] }>(
    `/seller-promotions/users/${ctx.mlUserId}?app_version=v2`,
    ctx.accessToken
  );
  return json?.results ?? [];
}

/** Anunciante (advertiser_id) do produto Ads (PADS) — precisa existir antes de qualquer
 * chamada de campanha/ad group. `null` quando o seller não tem Ads habilitado
 * (`Mercado Livre > Meu perfil > Publicidade`), não é erro. Testado ao vivo (2026-08-30). */
export async function mlBuscarAdvertiserId(ctx: MercadoLivreAuthContext): Promise<number | null> {
  const json = await mlGetComHeaders<{ advertisers: { advertiser_id: number; site_id: string }[] }>(
    `/advertising/advertisers?product_id=PADS`,
    ctx.accessToken,
    { "Api-Version": "1" }
  );
  return json?.advertisers?.[0]?.advertiser_id ?? null;
}

export type MercadoLivreCampanhaAds = {
  id: number;
  name: string;
  status: string;
  budget: number;
  /** Vem de graça na resposta, não precisa pedir como métrica (confirmado ao vivo
   * 2026-09-21) — orçamento diário configurado, usado pra distinguir "sem tração por falta
   * de dinheiro" (gasto real perto do teto) de "sem tração por qualidade" (sobra dinheiro
   * sem gastar). */
  daily_budget: number;
  /** Também vem de graça, sem precisar pedir — data de criação da campanha, usada pra medir
   * há quantos dias ela existe sem tração. */
  date_created: string;
  acos_target: number;
  metrics?: {
    cost: number;
    total_amount: number;
    units_quantity: number;
    clicks: number;
    /** Impressões — confirmado ao vivo 2026-09-21 que esse metric name funciona nesse
     * endpoint (diferente de `impression_share`/`top_impression_share`, que dão 400
     * "not allowed at endpoint campaigns_metrics" — não existe esse detalhamento aqui). */
    prints: number;
  };
};

/** Campanhas de Ads + métricas reais do período — endpoint atual pós-descontinuação de
 * 27/05/2026 (`/product_ads/campaigns` antigo dá 404). Path exige o `site_id` (ex. MLB)
 * antes de `advertisers`, e header `api-version: 2` — sem isso também dá 404. Testado ao
 * vivo (2026-08-30/31) contra a conta real da Djulios: bateu com o "Investimento" mostrado
 * na tela de Publicidade dela. */
export async function mlBuscarCampanhasAdsComMetricas(
  ctx: MercadoLivreAuthContext,
  advertiserId: number,
  siteId: string,
  dateFrom: string,
  dateTo: string
): Promise<MercadoLivreCampanhaAds[]> {
  const json = await mlGetComHeaders<{ results: MercadoLivreCampanhaAds[] }>(
    `/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search?date_from=${dateFrom}&date_to=${dateTo}&limit=50&metrics=clicks,cost,acos,total_amount,units_quantity,prints`,
    ctx.accessToken,
    { "api-version": "2" }
  );
  return json?.results ?? [];
}

export type MercadoLivreAdGroupAds = {
  id: number;
  /** family_id (grupo com variação) ou item_id (anúncio isolado) — mesma chave de
   * agrupamento já usada pelo Andrey (`chave` em gestorAnunciosSeoDados.ts). */
  ad_group_external_id: string;
  ad_group_type: "FAMILY" | "ITEM" | "CATALOG";
  campaign_id: number;
  title: string;
  status: string;
  metrics?: {
    cost: number;
    total_amount: number;
    units_quantity: number;
    clicks: number;
    /** Venda SEM publicidade (fora do clique do anúncio) — precisa somar com `units_quantity`/
     * `total_amount` pra chegar na venda TOTAL do produto, base real do TACoS. */
    organic_units_quantity: number;
    organic_units_amount: number;
  };
};

/** Ad groups (nível família/item) + métricas reais de todos os anúncios promovidos do
 * advertiser no período — é o que permite saber quanto foi gasto de Ads especificamente
 * em CADA produto, não só o total da conta. Inclui métricas orgânicas (venda sem
 * publicidade) pra calcular TACoS de verdade (gasto ÷ venda TOTAL), não ACOS (gasto ÷
 * venda só atribuída ao clique) — são coisas diferentes, TACoS é o que o seller configura
 * como meta. Mesmo cuidado de path/header da função acima. */
export async function mlBuscarAdGroupsComMetricas(
  ctx: MercadoLivreAuthContext,
  advertiserId: number,
  siteId: string,
  dateFrom: string,
  dateTo: string
): Promise<MercadoLivreAdGroupAds[]> {
  const json = await mlGetComHeaders<{ results: MercadoLivreAdGroupAds[] }>(
    `/advertising/${siteId}/advertisers/${advertiserId}/product_ads/ad_groups/search?date_from=${dateFrom}&date_to=${dateTo}&limit=200&metrics=CLICKS,COST,TOTAL_AMOUNT,UNITS_QUANTITY,ORGANIC_UNITS_QUANTITY,ORGANIC_UNITS_AMOUNT&filters[channel]=marketplace`,
    ctx.accessToken,
    { "api-version": "2" }
  );
  return json?.results ?? [];
}

/** Custo de frete REAL que o SELLER paga por esse item — usa o endpoint oficial de
 * simulação "no momento de publicar/editar" (`/users/{user_id}/shipping_options/free`), NÃO
 * o de checkout do comprador (`/items/{id}/shipping_options?zip_code=...`, usado até
 * 2026-09-28 — esse devolve o custo que o COMPRADOR paga no carrinho, não o do seller).
 *
 * Bug real corrigido em duas rodadas nessa data, testando ao vivo o Coimbra:
 * 1ª rodada (errada): código original tratava `list_cost` do endpoint de checkout como
 * custo do seller sempre — descontava R$43,99 de frete de um anúncio onde quem paga é o
 * comprador.
 * 2ª rodada (esse fix): a doc oficial do ML (https://developers.mercadolivre.com.br/pt_br/
 * custos-de-envio) deixa explícito que existe custo REAL pro seller mesmo com
 * `free_shipping: false` — uma tarifa por peso/dimensão da embalagem que incide mesmo
 * quando "o frete fica a cargo do comprador" (ver print do próprio ML: "A pagar R$8,45...
 * se aplica mesmo que o comprador pague o frete"). A doc pede explicitamente pra chamar
 * esse endpoint com `free_shipping=true` E `free_shipping=false` porque as duas dão
 * "opções de custo corretas e possíveis PARA O VENDEDOR" — ou seja, zerar o frete quando
 * `free_shipping` é `false` (a correção anterior) também estava errado. Não tinha como
 * confirmar 100% ao vivo por bloqueio de rede no ambiente de teste — validar no primeiro
 * rodar real do Ulisses após deploy. */
export async function mlBuscarFreteReal(
  itemId: string,
  ctx: MercadoLivreAuthContext,
  freeShipping: boolean | undefined
): Promise<number | null> {
  const json = await mlGet<{ coverage?: { all_country?: { list_cost?: number } } }>(
    `/users/${ctx.mlUserId}/shipping_options/free?item_id=${itemId}&free_shipping=${freeShipping ? "true" : "false"}`,
    ctx.accessToken
  );
  return json?.coverage?.all_country?.list_cost ?? null;
}

/** CEP de referência (São Paulo capital) só pra estimar o frete real que o vendedor banca —
 * o custo de verdade varia por CEP de destino (quanto mais longe, mais caro), não existe "o
 * frete" único. Usado como ponto de referência padrão até decidirmos algo mais preciso (ex.
 * CEP do próprio vendedor). */
const CEP_REFERENCIA_FRETE_PADRAO = "01310100";

/** Custo real de envio que o VENDEDOR banca pra um CEP de destino específico — diferente de
 * `mlBuscarFreteReal` (que só serve pra simular "quanto custaria SE eu oferecesse frete
 * grátis"), esse endpoint funciona pra qualquer anúncio, frete grátis ou não. Fórmula:
 * `base_cost` (custo real do envio) − `cost` (o que o COMPRADOR paga) = quanto sobra pro
 * vendedor cobrir. Usa a opção marcada como "recommended" (a que o ML destaca pro comprador);
 * cai pra primeira opção se nenhuma vier marcada. `null` quando a API não devolve opção
 * nenhuma pra esse CEP (ex. 2026-10-08: achado que precisa do escopo "Venda e envios de um
 * produto" liberado no app — sem isso dá 403, não null; conferir se o app tem esse escopo
 * antes de assumir "sem opção de envio" de verdade).
 */
export async function mlBuscarCustoRealEnvioParaDestino(
  itemId: string,
  ctx: MercadoLivreAuthContext,
  zipCode: string = CEP_REFERENCIA_FRETE_PADRAO
): Promise<number | null> {
  const json = await mlGet<{
    options?: Array<{ base_cost: number; cost: number; display: string }>;
  }>(`/items/${itemId}/shipping_options?zip_code=${encodeURIComponent(zipCode)}`, ctx.accessToken);
  if (!json?.options || json.options.length === 0) return null;
  const opcao = json.options.find((o) => o.display === "recommended") ?? json.options[0];
  return Math.max(0, Math.round((opcao.base_cost - opcao.cost) * 100) / 100);
}

type MercadoLivreBillingDetalhe = {
  charge_info?: { transaction_detail?: string; detail_amount?: number };
};

/** Varre o extrato REAL de faturamento (`billing/integration`) do período aberto mais
 * recente atrás de linhas de cobrança de afiliado — não existe API dedicada de afiliados
 * (pesquisado a fundo em 2026-08-30, sem endpoint público), mas o extrato de faturamento
 * lista toda cobrança que incide sobre a conta com descrição em texto
 * (`transaction_detail`), então uma cobrança de afiliado apareceria aqui se existisse.
 * Testado ao vivo (2026-08-31): varrido ~200 lançamentos reais da Djulios, nenhuma
 * cobrança de afiliado encontrada — bate com a conta não ter venda por afiliado
 * acontecendo agora (mesmo tipo de resposta real de "não tem ativo" já visto no cupom).
 * Limitado a `maxPaginas` por custo/latência — período pode ter milhares de linhas. */
export async function mlBuscarGastoAfiliadoReal(
  ctx: MercadoLivreAuthContext,
  maxPaginas = 3
): Promise<{ gastoReal: number; linhasVarridas: number }> {
  const periodos = await mlGet<{ results?: { key: string }[] }>(
    `/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=1`,
    ctx.accessToken
  );
  const key = periodos?.results?.[0]?.key;
  if (!key) return { gastoReal: 0, linhasVarridas: 0 };

  let gastoReal = 0;
  let linhasVarridas = 0;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const offset = pagina * 100;
    const json = await mlGet<{ results?: MercadoLivreBillingDetalhe[]; total?: number }>(
      `/billing/integration/periods/key/${encodeURIComponent(key)}/group/ML/details?document_type=BILL&limit=100&offset=${offset}`,
      ctx.accessToken
    );
    const results = json?.results ?? [];
    if (results.length === 0) break;
    for (const r of results) {
      const detalhe = r.charge_info?.transaction_detail ?? "";
      if (/afiliad|affiliate/i.test(detalhe)) gastoReal += r.charge_info?.detail_amount ?? 0;
    }
    linhasVarridas += results.length;
    if (json?.total != null && offset + results.length >= json.total) break;
  }
  return { gastoReal, linhasVarridas };
}

type MercadoLivreOrderSearchResult = {
  results?: { status: string; total_amount?: number }[];
  paging?: { total?: number };
};

/** Soma o `total_amount` de pedidos PAGOS de verdade (`/orders/search`, fonte primária —
 * pedido real, não atribuição de marketing) num período. Achado ao vivo (2026-09-03): o
 * `total_amount` que a própria API de campanhas de Ads devolve é só a venda que o ML decide
 * atribuir ao clique/impressão — numa conta real (Djulios) isso chegou a contar menos de
 * 1/3 do faturamento verdadeiro do mesmo período. TACoS "de conjunto" da conta tem que
 * usar ESSA função como denominador, nunca o total_amount de Ads (esse é a fonte certa só
 * pra ROAS). `dateFrom`/`dateTo` em ISO completo (ex. "2026-09-01T00:00:00.000Z"). */
export async function mlBuscarFaturamentoRealPeriodo(
  ctx: MercadoLivreAuthContext,
  dateFromIso: string,
  dateToIso: string,
  maxPaginas = 40
): Promise<number> {
  let offset = 0;
  let total = 0;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const json = await mlGet<MercadoLivreOrderSearchResult>(
      `/orders/search?seller=${ctx.mlUserId}&order.date_created.from=${encodeURIComponent(dateFromIso)}&order.date_created.to=${encodeURIComponent(dateToIso)}&limit=50&offset=${offset}`,
      ctx.accessToken
    );
    const results = json?.results ?? [];
    if (results.length === 0) break;
    for (const o of results) {
      if (o.status === "paid") total += o.total_amount ?? 0;
    }
    offset += results.length;
    if (offset >= (json?.paging?.total ?? 0)) break;
  }
  return total;
}

type MercadoLivreOrderSearchResultComItens = {
  results?: {
    status: string;
    total_amount?: number;
    date_created?: string;
    order_items?: {
      item?: { id?: string; title?: string; variation_id?: number };
      quantity?: number;
      unit_price?: number;
    }[];
  }[];
  paging?: { total?: number };
};

export type MercadoLivreResumoPedidosPeriodo = {
  faturamento: number;
  vendas: number;
  /** Quantidade + faturamento vendido por item_id, só de pedidos pagos — base pro ranking
   * "Top produtos" do Dashboard avulso. */
  itens: { itemId: string; titulo: string; quantidade: number; faturamento: number }[];
  /** Faturamento por dia civil em BRT (não UTC — pedido das 23h BRT não pode cair no dia
   * seguinte no gráfico do seller), só com pedido pago. Base pro sparkline do Dashboard
   * avulso. */
  porDia: { dia: string; faturamento: number; vendas: number }[];
  /** Venda REAL do período por variação (cor/tamanho) — confirmado ao vivo 2026-10-19 que
   * `order_items[].item.variation_id` já vem na resposta padrão do `/orders/search`, sem
   * parâmetro extra. Chave composta `${itemId}:${variationId}` pra não colidir variação de
   * itens diferentes com o mesmo `variation_id` numérico. */
  porVariacao: { itemId: string; variationId: number; quantidade: number }[];
};

/** `date_created` do pedido vem em UTC — desloca -3h antes de cortar a data civil, mesmo
 * ajuste BRT já usado nos outros lugares do sistema que mostram data pro seller. */
function dataCreatedParaDiaBrt(dateCreatedIso: string): string {
  const d = new Date(new Date(dateCreatedIso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Mesma fonte de verdade de `mlBuscarFaturamentoRealPeriodo` (`/orders/search`, pedido
 * PAGO de verdade), mas também devolve a quebra por item — usado pro resumo financeiro do
 * hub avulso (faturamento, nº de vendas e produto campeão num período). Função nova, não
 * reaproveita a outra pra não arriscar regressão no TACoS (que já usa aquela em produção). */
export async function mlBuscarResumoPedidosPeriodo(
  ctx: MercadoLivreAuthContext,
  dateFromIso: string,
  dateToIso: string,
  maxPaginas = 40
): Promise<MercadoLivreResumoPedidosPeriodo> {
  let offset = 0;
  let faturamento = 0;
  let vendas = 0;
  const porItem = new Map<string, { titulo: string; quantidade: number; faturamento: number }>();
  const porDia = new Map<string, { faturamento: number; vendas: number }>();
  const porVariacao = new Map<string, { itemId: string; variationId: number; quantidade: number }>();

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const json = await mlGet<MercadoLivreOrderSearchResultComItens>(
      `/orders/search?seller=${ctx.mlUserId}&order.date_created.from=${encodeURIComponent(dateFromIso)}&order.date_created.to=${encodeURIComponent(dateToIso)}&limit=50&offset=${offset}`,
      ctx.accessToken
    );
    const results = json?.results ?? [];
    if (results.length === 0) break;
    for (const o of results) {
      if (o.status !== "paid") continue;
      faturamento += o.total_amount ?? 0;
      vendas += 1;
      for (const oi of o.order_items ?? []) {
        const itemId = oi.item?.id;
        if (!itemId) continue;
        const atual = porItem.get(itemId) ?? { titulo: oi.item?.title ?? itemId, quantidade: 0, faturamento: 0 };
        atual.quantidade += oi.quantity ?? 0;
        atual.faturamento += (oi.unit_price ?? 0) * (oi.quantity ?? 0);
        porItem.set(itemId, atual);

        const variationId = oi.item?.variation_id;
        if (variationId) {
          const chaveVariacao = `${itemId}:${variationId}`;
          const atualVariacao = porVariacao.get(chaveVariacao) ?? { itemId, variationId, quantidade: 0 };
          atualVariacao.quantidade += oi.quantity ?? 0;
          porVariacao.set(chaveVariacao, atualVariacao);
        }
      }
      if (o.date_created) {
        const dia = dataCreatedParaDiaBrt(o.date_created);
        const atual = porDia.get(dia) ?? { faturamento: 0, vendas: 0 };
        atual.faturamento += o.total_amount ?? 0;
        atual.vendas += 1;
        porDia.set(dia, atual);
      }
    }
    offset += results.length;
    if (offset >= (json?.paging?.total ?? 0)) break;
  }

  return {
    faturamento,
    vendas,
    itens: Array.from(porItem.entries()).map(([itemId, v]) => ({
      itemId,
      titulo: v.titulo,
      quantidade: v.quantidade,
      faturamento: v.faturamento,
    })),
    porDia: Array.from(porDia.entries())
      .map(([dia, v]) => ({ dia, faturamento: v.faturamento, vendas: v.vendas }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    porVariacao: Array.from(porVariacao.values()),
  };
}

export type MercadoLivrePromocaoItem = {
  /** Ausente pra `type: "PRICE_DISCOUNT"` (self-service, sem campanha com id) — presente pra
   * DEAL/SELLER_CAMPAIGN (campanha existente que o item integra/pode integrar). */
  id?: string;
  type: string;
  status: string;
  price?: number;
  original_price?: number;
  name?: string | null;
  start_date?: string | null;
  finish_date?: string | null;
  /** Faixa de preço promocional que o ML aceita pra esse item nessa promoção — só vem
   * preenchido nas candidatas (achado ao vivo 2026-09-08). */
  min_discounted_price?: number;
  max_discounted_price?: number;
  /** Sugestão do próprio ML dentro da faixa min/max — nem sempre bate com `price` (achado
   * ao vivo 2026-09-20: pra LIGHTNING, `price` do candidato pode vir fora do intervalo
   * [min_discounted_price, max_discounted_price] reportado aqui, os dois parecem vir de
   * motores de sugestão diferentes — ver `mlBuscarLimitesLightning`). */
  suggested_discounted_price?: number;
};

async function mlBuscarPromocoesItemBruto(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivrePromocaoItem[]> {
  const json = await mlGet<MercadoLivrePromocaoItem[]>(
    `/seller-promotions/items/${itemId}?app_version=v2`,
    ctx.accessToken
  );
  return json ?? [];
}

/** Promoção(ões) rodando de verdade num item específico (`status: "started"`, não
 * candidata) — diferente de `mlBuscarPromocoesAtivas`, que só sabe o que existe no NÍVEL
 * DA CONTA, sem confirmar se um SKU específico participa. Testado ao vivo (2026-09-03):
 * é o único jeito de saber, por exemplo, que um item tem uma campanha DEAL rodando com
 * 49% de desconto sobre o preço de tabela. Devolve só as ATIVAS (ignora `candidate`) —
 * candidatas são oferta que o seller ainda não aceitou, não afetam a margem hoje. */
export async function mlBuscarPromocaoAtivaItem(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<MercadoLivrePromocaoItem[]> {
  const todas = await mlBuscarPromocoesItemBruto(itemId, ctx);
  return todas.filter((p) => p.status === "started");
}

/** Faixa de preço aceita pelo ML pra inscrever o item numa promoção `PRICE_DISCOUNT`
 * (self-service, sem convite) — usado só pra validar ANTES de tentar criar (evita round-trip
 * de erro quando o preço digitado pelo seller estoura o teto/piso que o próprio ML aceita,
 * que é diferente do "preço mínimo seguro" calculado pelo Ulisses). `null` quando o item não
 * é candidato a esse tipo de promoção agora. */
export async function mlBuscarLimitesPromocaoPrecoDesconto(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<{ min: number; max: number } | null> {
  const todas = await mlBuscarPromocoesItemBruto(itemId, ctx);
  const candidata = todas.find((p) => p.type === "PRICE_DISCOUNT");
  if (!candidata || candidata.min_discounted_price == null || candidata.max_discounted_price == null) return null;
  return { min: candidata.min_discounted_price, max: candidata.max_discounted_price };
}

/** Faixa de preço que o ML reporta pro tipo `LIGHTNING` do item — mesma família de campo do
 * `PRICE_DISCOUNT` acima, mas **ainda não confirmado ao vivo se o ML de fato valida
 * `deal_price` contra esse intervalo na hora de aceitar** (achado 2026-09-20: nesse mesmo
 * endpoint, o `price` do candidato pode vir maior que o `max_discounted_price` reportado
 * aqui, o que não faria sentido se `max` fosse mesmo o teto aceito). Usar como sugestão pra
 * calcular a margem, não como garantia de que o ML vai aceitar qualquer valor dentro dela —
 * o accept real ainda é a fonte da verdade (ver `mlAceitarCandidatoLightning`). */
export async function mlBuscarLimitesLightning(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<{ min: number; max: number; sugerido: number } | null> {
  const todas = await mlBuscarPromocoesItemBruto(itemId, ctx);
  const candidata = todas.find((p) => p.type === "LIGHTNING");
  if (
    !candidata ||
    candidata.min_discounted_price == null ||
    candidata.max_discounted_price == null ||
    candidata.suggested_discounted_price == null
  ) {
    return null;
  }
  return {
    min: candidata.min_discounted_price,
    max: candidata.max_discounted_price,
    sugerido: candidata.suggested_discounted_price,
  };
}

/** BRT é UTC-3 fixo (sem horário de verão no Brasil desde 2019) — o ML exige as datas de
 * início/fim da promoção em "formato local" (achado ao vivo 2026-09-08: manda com sufixo de
 * timezone e ele rejeita com "Start and finish dates must be in local format"), então
 * convertemos aqui em vez de usar `toISOString()` cru (que devolveria UTC). */
function dataLocalBrasilISO(data: Date): string {
  const brt = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 19);
}

function dataLocalBrasilFimDoDia(data: Date): string {
  const brt = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.toISOString().slice(0, 10)}T23:59:59`;
}

const PROMOCAO_PRECO_DESCONTO_DURACAO_DIAS = 30;

/** Cria uma promoção `PRICE_DISCOUNT` de verdade no item (contrato descoberto testando ao
 * vivo 2026-09-08 — a doc oficial não é acessível por aqui): diferente de
 * `mlAtualizarPrecoSeguro` (que só reescreve `price`, sem badge/prazo/"de-por"), isso
 * inscreve o item numa promoção real — o ML passa a mostrar `original_price` riscado e o
 * preço novo como oferta, com prazo. Duração fixa de 30 dias a partir de agora (sem pedido
 * específico de prazo diferente ainda). */
export async function mlCriarPromocaoPrecoDesconto(
  itemId: string,
  precoPromocional: number,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true; offerId: string } | { ok: false; erro: string }> {
  const agora = new Date();
  const fim = new Date(agora.getTime() + PROMOCAO_PRECO_DESCONTO_DURACAO_DIAS * 24 * 60 * 60 * 1000);
  const res = await fetch(`${ML_API_BASE}/seller-promotions/items/${itemId}?app_version=v2`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      promotion_type: "PRICE_DISCOUNT",
      deal_price: Math.round(precoPromocional * 100) / 100,
      start_date: dataLocalBrasilISO(agora),
      finish_date: dataLocalBrasilFimDoDia(fim),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    offer_id?: string;
    message?: string;
    error?: string;
    cause?: { error_code?: string; error_message?: string }[];
  };
  if (!res.ok) {
    const causa = json.cause?.map((c) => c.error_message ?? c.error_code).filter(Boolean).join("; ");
    return { ok: false, erro: causa || json.message || json.error || `HTTP ${res.status}` };
  }
  return { ok: true, offerId: json.offer_id ?? "" };
}

/** Container recorrente de Oferta Relâmpago da conta — confirmado ao vivo (2026-08-31 e
 * 2026-09-16) que é sempre esse ID fixo (`LGH-MLB1000`), não muda por campanha. */
const LIGHTNING_DEAL_ID = "LGH-MLB1000";

export type MercadoLivreLightningCandidato = {
  id: string;
  dealId: string;
  price: number;
  originalPrice: number;
  stockMax: number;
};

/** Itens que o ML selecionou automaticamente como candidatos à oferta relâmpago recorrente
 * da conta, ainda não decididos (`status: "candidate"` — os já aceitos viram `OFFER-...` e
 * somem daqui). Preço é sugerido pelo próprio ML, o seller só pode aceitar ou ignorar, não
 * escolher outro valor (achado 2026-08-31, ver memória de projeto). */
export async function mlBuscarCandidatosLightning(ctx: MercadoLivreAuthContext): Promise<MercadoLivreLightningCandidato[]> {
  const candidatos = new Map<string, MercadoLivreLightningCandidato>();
  let offset = 0;
  for (let pagina = 0; pagina < 20; pagina++) {
    const json = await mlGet<{
      results?: Array<{ id: string; status?: string; price?: number; original_price?: number; stock?: { max?: number } }>;
    }>(
      `/seller-promotions/promotions/${LIGHTNING_DEAL_ID}/items?app_version=v2&promotion_type=LIGHTNING&limit=50&offset=${offset}`,
      ctx.accessToken
    );
    const results = json?.results ?? [];
    for (const r of results) {
      if (r.status !== "candidate" || !r.price || !r.original_price) continue;
      candidatos.set(r.id, {
        id: r.id,
        dealId: LIGHTNING_DEAL_ID,
        price: r.price,
        originalPrice: r.original_price,
        stockMax: r.stock?.max ?? 0,
      });
    }
    if (results.length < 50) break;
    offset += 50;
  }
  return Array.from(candidatos.values());
}

/** Aceita um candidato de oferta relâmpago de verdade — escrita real confirmada ao vivo
 * (2026-09-16, ver docs/SCHEMA.md): contrato só foi achado via doc pública (não testado por
 * tentativa-e-erro como os outros — a doc oficial do Mercado Livre bate certo aqui).
 * **Correção 2026-09-20**: `dealPrice` NÃO precisa ser o valor cru que o ML sugeriu no
 * candidato — confirmado ao vivo (logado como o seller) que a tela "Revise e confirme as
 * propostas" tem o valor/% editável antes de confirmar.
 * **Teste ao vivo controlado 2026-09-22 (aprovado pelo Sr Stark, 1 item real da Djulios,
 * SKU DJU005015)**: mandado `deal_price: 89.91` contra um candidato cujo `precoSugeridoMl`
 * era 94.90 — **o ML aceitou de verdade**, devolveu `offer_id` real
 * (`OFFER-MLB7191922108-13894616129`), status 200. Confirma que dá pra liberar essa edição
 * em lote sem ressalva — não é mais só teoria.
 * **Teste ao vivo 2026-09-22 (mesma sessão) — limite de cima confirmado**: mandar
 * `deal_price` MAIOR que o `precoSugeridoMl` (desconto mais raso que o padrão do ML) é
 * **sempre rejeitado** — `400 "The discounted price is not credible."` — testado 2x contra
 * itens reais (SKU DJU005008, 94.90→97 rejeitado; e um erro incidental 69.81→89.91 também
 * rejeitado). Ou seja: o ML só aceita igual ou MAIS raso que o próprio sugerido, nunca mais
 * raso pra menos desconto. Isso confirma que o teto de `limitarPrecoLightning`
 * (`precoSugeridoMl`) não é conservador à toa — é o limite real da API, não vale a pena
 * tentar afrouxar. Não existe endpoint de "recusar" documentado — recusar é só não aceitar
 * (item some da lista sozinho quando a janela do candidato expira). */
export async function mlAceitarCandidatoLightning(
  itemId: string,
  dealId: string,
  dealPrice: number,
  originalPrice: number,
  stock: number,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true; offerId: string } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/seller-promotions/items/${itemId}?app_version=v2`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deal_id: dealId,
      original_price: originalPrice,
      deal_price: dealPrice,
      promotion_type: "LIGHTNING",
      stock,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    offer_id?: string;
    message?: string;
    error?: string;
    cause?: { error_code?: string; error_message?: string }[];
  };
  if (!res.ok) {
    const causa = json.cause?.map((c) => c.error_message ?? c.error_code).filter(Boolean).join("; ");
    return { ok: false, erro: causa || json.message || json.error || `HTTP ${res.status}` };
  }
  return { ok: true, offerId: json.offer_id ?? "" };
}

/** Checagem mínima de dono, pra ações que não precisam do estado completo de título (ex.
 * aplicar descrição) — usa o `seller_id` que o próprio ML devolve, não o mapa interno de
 * SKU (cobertura parcial, ver mlBuscarItemTituloEstado). */
export async function mlBuscarItemDono(
  itemId: string,
  ctx: MercadoLivreAuthContext
): Promise<{ sellerId: number } | null> {
  const json = await mlGet<{ seller_id: number }>(`/items/${itemId}?attributes=id,seller_id`, ctx.accessToken);
  return json ? { sellerId: json.seller_id } : null;
}

export type MercadoLivreMetricaTaxa = { period: string; rate: number; value: number };

export type MercadoLivreReputacao = {
  levelId: string | null;
  powerSellerStatus: string | null;
  reclamacoes: MercadoLivreMetricaTaxa | null;
  atrasoManuseio: MercadoLivreMetricaTaxa | null;
  cancelamentos: MercadoLivreMetricaTaxa | null;
};

/** `GET /users/{id}` inclui `seller_reputation` sem precisar de escopo extra — testado ao
 * vivo (2026-08-25) com token da própria conexão OAuth já usada pelos outros gestores.
 * `metrics.*.period` varia por conta (ex. "60 days" pra quem vende bastante, "365 days" pra
 * conta nova/sem venda) — não fixar janela própria, usar o period que a API devolveu. */
export async function mlBuscarReputacao(ctx: MercadoLivreAuthContext): Promise<MercadoLivreReputacao | null> {
  const json = await mlGet<{
    seller_reputation?: {
      level_id: string | null;
      power_seller_status: string | null;
      metrics?: {
        claims?: MercadoLivreMetricaTaxa;
        delayed_handling_time?: MercadoLivreMetricaTaxa;
        cancellations?: MercadoLivreMetricaTaxa;
      };
    };
  }>(`/users/${ctx.mlUserId}`, ctx.accessToken);
  const rep = json?.seller_reputation;
  if (!rep) return null;
  return {
    levelId: rep.level_id,
    powerSellerStatus: rep.power_seller_status,
    reclamacoes: rep.metrics?.claims ?? null,
    atrasoManuseio: rep.metrics?.delayed_handling_time ?? null,
    cancelamentos: rep.metrics?.cancellations ?? null,
  };
}

export type MercadoLivrePergunta = { id: number; itemId: string; texto: string; dataCriacao: string };

/** Estado mínimo pra validar dono antes de responder — mesmo padrão das outras escritas
 * (checa contra a API de origem, não confia em cache/mapa interno). Testado ao vivo
 * (2026-08-25): `GET /questions/{id}` devolve `seller_id` direto. */
export async function mlBuscarPerguntaEstado(
  perguntaId: number,
  ctx: MercadoLivreAuthContext
): Promise<{ sellerId: number; status: string } | null> {
  const json = await mlGet<{ seller_id: number; status: string }>(`/questions/${perguntaId}`, ctx.accessToken);
  return json ? { sellerId: json.seller_id, status: json.status } : null;
}

/** Responde pergunta pré-venda de verdade. Testado ao vivo (2026-08-25) com question_id
 * inválido de propósito (pra não responder pergunta real só pra validar formato) — devolveu
 * 404 "Question not found", confirma que o endpoint/auth funcionam com o escopo atual. */
export async function mlResponderPergunta(
  perguntaId: number,
  texto: string,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/answers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: perguntaId, text: texto }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, erro: json.message ?? json.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Perguntas sem resposta do vendedor — testado ao vivo (2026-08-25), mesmo token OAuth,
 * sem escopo adicional. `status=UNANSWERED` já filtra no servidor do ML. */
export async function mlBuscarPerguntasPendentes(
  ctx: MercadoLivreAuthContext,
  limit = 20
): Promise<MercadoLivrePergunta[]> {
  const json = await mlGet<{
    questions?: Array<{ id: number; item_id: string; text: string; date_created: string }>;
  }>(`/questions/search?seller_id=${ctx.mlUserId}&status=UNANSWERED&limit=${limit}`, ctx.accessToken);
  return (json?.questions ?? []).map((q) => ({
    id: q.id,
    itemId: q.item_id,
    texto: q.text,
    dataCriacao: q.date_created,
  }));
}

/** Diferente de título: descrição NÃO tem a trava de família nem de venda — confirmado
 * testando ao vivo (200 em item com família e em item já vendido). Dá pra aplicar de
 * verdade em cada variação de uma família, não só no representante. */
export async function mlAtualizarDescricao(
  itemId: string,
  texto: string,
  ctx: MercadoLivreAuthContext
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const res = await fetch(`${ML_API_BASE}/items/${itemId}/description`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plain_text: texto }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, erro: json.message ?? json.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Data em que o ML deve liberar a etiqueta pro pedido (buffer próprio de capacidade de
 * transportadora — não é rate limit nosso). Confirmado ao vivo (2026-09-22): enquanto o
 * shipment está nesse buffer, `GET /shipment_labels` devolve `NOT_PRINTABLE_STATUS`, mas
 * `GET /shipments/{id}/lead_time` já expõe a data real que o próprio ML mostra pro
 * vendedor ("Para enviar no dia X"). Retorna `null` se o pedido não existir mais, não tiver
 * envio, ou a API falhar — chamador deve tratar como "sem previsão conhecida", nunca erro. */
export async function mlBuscarPrevisaoLiberacaoEtiqueta(
  ctx: MercadoLivreAuthContext,
  marketplaceNumero: string
): Promise<string | null> {
  const order = await mlGet<{ shipping?: { id?: number | string } }>(`/orders/${marketplaceNumero}`, ctx.accessToken);
  const shippingId = order?.shipping?.id;
  if (!shippingId) return null;
  const lead = await mlGet<{ estimated_handling_limit?: { date?: string } }>(
    `/shipments/${shippingId}/lead_time`,
    ctx.accessToken
  );
  return lead?.estimated_handling_limit?.date ?? null;
}

/** Mesmo teto usado pro PDF da Olist (`MAX_ETIQUETA_PDF_BYTES` em olistTinyApi.ts) — limite
 * de tamanho de coluna/linha no Postgres pra guardar o base64, não é limite do ML. */
const MAX_ETIQUETA_PDF_BYTES_ML = Math.floor(1.35 * 1024 * 1024);

/** Garante que uma etiqueta ML (bytes crus) está no formato final: só 1 página (sem a
 * "lista de coleta" do ML) e já fisicamente rotacionada, sem depender da flag `/Rotate`.
 * Mesma transformação usada dentro de `mlBuscarEtiquetaPdf` — extraída pra também corrigir
 * na hora de imprimir etiqueta que já ficou cacheada em `pedidos.etiqueta_pdf_base64`/`_url`
 * ANTES dessa correção existir (achado 2026-11-02: teste real de impressão ainda saiu
 * cortado, porque o PDF salvo no banco era de antes do deploy do fix — essa função é
 * chamada também em `etiquetas-combinadas/route.ts` pra normalizar na hora de imprimir,
 * sem precisar de backfill). Idempotente: PDF já normalizado (1 página, rotation 0) volta
 * sem mudança nenhuma. */
export async function normalizarEtiquetaMlPdf(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes);
    const paginaOriginal = doc.getPages()[0];
    if (!paginaOriginal) return bytes;
    if (doc.getPageCount() === 1 && paginaOriginal.getRotation().angle === 0) return bytes;

    const { width, height } = paginaOriginal.getSize();
    const soEtiqueta = await PDFDocument.create();
    const paginaEmbutida = await soEtiqueta.embedPage(paginaOriginal);
    const novaPagina = soEtiqueta.addPage([height, width]);
    novaPagina.drawPage(paginaEmbutida, {
      x: 0,
      y: width,
      width,
      height,
      rotate: degrees(-90),
    });
    return await soEtiqueta.save();
  } catch (e: unknown) {
    console.error("[normalizarEtiquetaMlPdf] falhou, usando PDF original:", e);
    return bytes;
  }
}

export type MlEtiquetaPdfResultado = {
  pdfBase64: string | null;
  /** Motivo real devolvido pelo ML quando `pdfBase64` é null (ex.: `NOT_PRINTABLE_STATUS`,
   * erro de nota fiscal) — só pra log/alerta, nunca usado pra decidir fluxo. */
  erro: string | null;
};

/** Busca o PDF real da etiqueta de envio no ML e devolve em base64 — usado pelo retry
 * dedicado (`etiquetaMlRetry.ts`), já que o webhook não avisa quando ela libera (ver
 * comentário em `/api/webhooks/mercadolivre`) e a tentativa não pode rodar só uma vez.
 * `GET /shipment_labels?response_type=pdf` devolve o PDF binário quando pronto, ou um JSON
 * de erro (`NOT_PRINTABLE_STATUS` enquanto no buffer da transportadora, ou outro código se o
 * shipment não existir/token não tiver permissão) — em qualquer caso de erro `pdfBase64` vem
 * `null`, nunca lança, pra o chamador tratar como "ainda não tem etiqueta" e tentar de novo
 * depois; o texto do erro agora vai em `erro` (achado 2026-10-27 investigando o seller Vinz
 * Collection: antes o corpo do erro era descartado e não dava pra saber que era nota fiscal
 * sem emitir, só "não achou"). */
export async function mlBuscarEtiquetaPdf(
  ctx: MercadoLivreAuthContext,
  marketplaceNumero: string
): Promise<MlEtiquetaPdfResultado> {
  const order = await mlGet<{ shipping?: { id?: number | string } }>(`/orders/${marketplaceNumero}`, ctx.accessToken);
  const shippingId = order?.shipping?.id;
  if (!shippingId) return { pdfBase64: null, erro: "Pedido sem shipping_id no Mercado Livre." };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${ML_API_BASE}/shipment_labels?shipment_ids=${shippingId}&response_type=pdf`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return { pdfBase64: null, erro: corpo.slice(0, 500) || `HTTP ${res.status}` };
    }

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("pdf")) {
      const corpo = await res.text().catch(() => "");
      return { pdfBase64: null, erro: corpo.slice(0, 500) || "Resposta sem PDF." };
    }

    const buf = await res.arrayBuffer();

    // Com 1 shipment_id, o ML devolve a etiqueta real na página 1 e, junto, uma 2ª página de
    // "lista de coleta" (resumo pro operador do centro de distribuição do próprio ML) — não
    // existe parâmetro na API pra excluir essa página. Corta pra ficar só a página 1 e gira
    // 90° pra bater com a orientação que sai na impressora térmica do fornecedor (comparado
    // ao formato da UpSeller — achado 2026-10-27, confirmado com o Sr Stark que o problema
    // era só a rotação, não a página extra em si nem a nota fiscal).
    //
    // Achado 2026-11-02: só marcar `/Rotate` (setRotation) deixa o MediaBox da página com o
    // tamanho original (retrato), sem o conteúdo girado fisicamente. Isso funciona na
    // pré-visualização e em "ajustar à área de impressão", mas ao imprimir em "4x6" com
    // escala 100% o Chrome corta a etiqueta pela metade (perde o código de barras inteiro —
    // confirmado com print real do fornecedor testando pedido da Vinz). Correção: desenha o
    // conteúdo já fisicamente rotacionado numa página nova com largura/altura trocadas, em
    // vez de só marcar a flag — remove a ambiguidade pra qualquer motor de impressão.
    const pdfFinal = await normalizarEtiquetaMlPdf(new Uint8Array(buf));

    if (pdfFinal.byteLength > MAX_ETIQUETA_PDF_BYTES_ML) {
      return { pdfBase64: null, erro: "PDF maior que o limite de armazenamento." };
    }

    return { pdfBase64: Buffer.from(new Uint8Array(pdfFinal)).toString("base64"), erro: null };
  } catch (e: unknown) {
    return { pdfBase64: null, erro: e instanceof Error ? e.message : "Erro de rede desconhecido." };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Status real do pedido na API do ML — nunca confiar no payload de webhook pra decidir
 * cancelamento, sempre rebuscar aqui com nosso token (mesmo racional dos outros reprocessamentos
 * deste client). `status: "cancelled"` é o que o ML usa quando a venda foi cancelada (ex.: etiqueta
 * nunca liberada por falta de nota fiscal, item some do catálogo, etc.).
 */
export async function mlBuscarStatusPedido(
  orderId: string,
  ctx: MercadoLivreAuthContext
): Promise<{ status: string } | null> {
  const order = await mlGet<{ status?: string }>(`/orders/${orderId}`, ctx.accessToken);
  if (!order?.status) return null;
  return { status: order.status };
}
