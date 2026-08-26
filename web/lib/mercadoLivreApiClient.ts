/**
 * Cliente autenticado da API do Mercado Livre pro lado servidor (crons, gestores de IA).
 * Cuida de decriptar/renovar o token salvo em seller_mercadolivre_integrations — os jobs
 * batch (gestorAnunciosSeoDados.ts etc.) não sabem nada de OAuth, só chamam getValid... e
 * usam o token pronto.
 */
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
  const { data: row, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token, ml_refresh_token, ml_access_token_expires_at")
    .eq("seller_id", sellerId)
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
    .eq("seller_id", sellerId);

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
  const limit = 100;
  const ids: string[] = [];
  let offset = 0;
  while (true) {
    const json = await mlGet<MercadoLivreItemSearchResult>(
      `/users/${ctx.mlUserId}/items/search?status=active&limit=${limit}&offset=${offset}`,
      ctx.accessToken
    );
    const pagina = json?.results ?? [];
    ids.push(...pagina);
    if (pagina.length < limit || (json?.paging?.total ?? 0) <= ids.length) break;
    offset += limit;
  }
  return ids;
}

export type MercadoLivreAttribute = { id: string; value_name: string | null };

export type MercadoLivreVariation = {
  id: number;
  attribute_combinations?: MercadoLivreAttribute[];
};

export type MercadoLivreItemDetail = {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  start_time: string;
  category_id: string;
  seller_id: number;
  pictures?: { id: string; max_size?: string }[];
  attributes?: MercadoLivreAttribute[];
  variations?: MercadoLivreVariation[];
  family_id?: string | number | null;
  family_name?: string | null;
};

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

export type MercadoLivreReclamacao = {
  id: number;
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
    data?: Array<{ id: number; resource_id: number | string; status: string; type: string; reason_id: string; date_created: string }>;
  }>(
    `/post-purchase/v1/claims/search?player_role=respondent&player_user_id=${ctx.mlUserId}&status=opened&limit=${limit}`,
    ctx.accessToken
  );
  return (json?.data ?? []).map((c) => ({
    id: c.id,
    resourceId: String(c.resource_id),
    status: c.status,
    type: c.type,
    reasonId: c.reason_id,
    dateCreated: c.date_created,
  }));
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

export type MercadoLivreAtributoCategoria = {
  id: string;
  name: string;
  /** 1 = característica principal, 2 = secundária (confirmado testando a API — não é doc oficial). */
  relevance: number;
  required: boolean;
  /** "list" = só aceita valor de `valoresPermitidos` (testado ao vivo: texto livre resolve certo quando
   * bate com uma opção, mas não testamos o que acontece quando não bate — mais seguro forçar escolha
   * dentre as opções reais). Outros tipos (ex. "string") aceitam texto livre. */
  valueType: string;
  /** Nomes das opções válidas — só populado quando valueType === "list". */
  valoresPermitidos: string[];
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
      tags?: { required?: boolean };
      value_type?: string;
      values?: { name: string }[];
    }>
  >(`/categories/${categoryId}/attributes`, ctx.accessToken);
  return (json ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    relevance: a.relevance ?? 2,
    required: Boolean(a.tags?.required),
    valueType: a.value_type ?? "string",
    valoresPermitidos: a.value_type === "list" ? (a.values ?? []).map((v) => v.name) : [],
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

/** Menor lado (largura ou altura) da maior resolução disponível da foto (`max_size`,
 * formato "WxH") — usado pra sinalizar foto de baixa qualidade, não só contagem. Retorna
 * null quando o dado não vem (não bloqueia nada, só deixa de sinalizar). */
export function menorLadoFotoMaxSize(maxSize: string | undefined): number | null {
  if (!maxSize) return null;
  const match = maxSize.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return Math.min(Number(match[1]), Number(match[2]));
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
  atributos: { id: string; value_name: string }[],
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
