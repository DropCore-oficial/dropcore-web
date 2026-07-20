const TINY_API2_BASE = "https://api.tiny.com.br/api2";
const OLIST_INFO_URL = `${TINY_API2_BASE}/info.php`;

type TinyRetornoBase = {
  status?: string;
  status_processamento?: number;
  erros?: Array<{ erro?: string }>;
  codigo_erro?: number | string;
};

const TINY_ERROR_CODES: Record<number, string> = {
  1: "Token não informado.",
  2: "Token inválido ou não encontrado.",
  5: "API bloqueada ou sem acesso.",
  6: "API bloqueada momentaneamente por excesso de requisições.",
  10: "Parâmetro obrigatório não informado.",
  11: "API bloqueada momentaneamente por excesso de requisições concorrentes.",
  20: "A consulta não retornou registros.",
  21: "A consulta retornou muitos registros.",
  23: "A página solicitada não existe.",
  35: "Erro inesperado na Olist/Tiny. Tente novamente em instantes.",
  99: "Sistema da Olist/Tiny em manutenção.",
};

/**
 * Detecta mensagem de rate limit da Tiny/Olist (código 6/11 ou o texto livre que a API
 * costuma mandar: "API Bloqueada - Excedido o número de acessos..."). Usado pelos crons
 * pra parar de gastar chamada assim que a API já sinalizou bloqueio — continuar batendo
 * só atrasa a liberação e desperdiça o budget de requisições do token.
 */
export function isTinyRateLimitMessage(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m) return false;
  return (
    (m.includes("bloquead") && (m.includes("acesso") || m.includes("requisi"))) ||
    m.includes("requisições concorrentes") ||
    m.includes("requisicoes concorrentes")
  );
}

function unwrapTinyRetorno<T extends TinyRetornoBase>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  if (root.retorno && typeof root.retorno === "object") {
    return root.retorno as T;
  }
  return root as T;
}

function readTinyErrors(retorno: TinyRetornoBase | null | undefined): string {
  const msg = retorno?.erros?.map((e) => e.erro).filter(Boolean).join(" ");
  if (msg?.trim()) return msg.trim();

  const code = Number(retorno?.codigo_erro);
  if (Number.isFinite(code) && TINY_ERROR_CODES[code]) {
    return TINY_ERROR_CODES[code];
  }

  if (retorno?.status_processamento === 2) {
    return "A Olist/Tiny rejeitou a solicitação por erro de validação.";
  }

  return "A Olist/Tiny retornou erro sem detalhes.";
}

function isTinyRetornoOk(retorno: TinyRetornoBase | null | undefined): boolean {
  if (!retorno) return false;
  if (String(retorno.status ?? "").trim().toUpperCase() === "OK") return true;
  return Number(retorno.status_processamento) === 3;
}

function isTinyNoRecords(retorno: TinyRetornoBase | null | undefined): boolean {
  if (!retorno) return false;
  if (Number(retorno.codigo_erro) === 20) return true;
  const msg = retorno.erros?.map((e) => e.erro).filter(Boolean).join(" ").toLowerCase() ?? "";
  return msg.includes("não retornou registros") || msg.includes("nao retornou registros");
}

async function readTinyHttpJson(res: Response): Promise<unknown> {
  const text = (await res.text()).replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error("A Olist/Tiny retornou corpo vazio.");
  }
  try {
    return JSON.parse(text);
  } catch {
    if (text.startsWith("<")) {
      throw new Error("A Olist/Tiny respondeu em XML. Verifique o token e o parâmetro formato=JSON.");
    }
    throw new Error(`Resposta inválida da Olist/Tiny (${text.slice(0, 160)}).`);
  }
}

function formatTinyApiDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTinyApiDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${pad(date.getFullYear())}`;
}

async function postTinyApi2Form<T extends TinyRetornoBase>(
  path: string,
  apiToken: string,
  fields: Record<string, string>
): Promise<T> {
  const token = apiToken.trim();
  if (!token) {
    throw new Error("Informe o token API da Olist/Tiny.");
  }

  const body = new URLSearchParams({
    token,
    formato: "JSON",
    ...fields,
  });

  const res = await fetch(`${TINY_API2_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`A Olist/Tiny respondeu com HTTP ${res.status} em ${path}.`);
  }

  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<T>(json);
  if (!retorno) {
    throw new Error("Resposta inválida da Olist/Tiny.");
  }
  if (!isTinyRetornoOk(retorno)) {
    throw new Error(readTinyErrors(retorno));
  }

  return retorno;
}

export type OlistPedidoResumo = {
  id: number;
  numero: number | null;
  numero_ecommerce: string | null;
  situacao: string | null;
  codigo_rastreamento: string | null;
  data_pedido: string | null;
};

export type OlistPedidoItem = {
  id_produto: number | null;
  codigo: string | null;
  descricao: string | null;
  quantidade: number;
};

export type OlistPedidoDetalhe = OlistPedidoResumo & {
  forma_envio: string | null;
  itens: OlistPedidoItem[];
  comprador_nome: string | null;
  comprador_cidade: string | null;
  comprador_uf: string | null;
  comprador_fone: string | null;
  /** Marketplace de origem normalizado (shopee | mercado_livre | shein | tiktok_shop | outro). */
  canal_venda: CanalVenda;
};

export type CanalVenda = "shopee" | "mercado_livre" | "shein" | "tiktok_shop" | "outro";

/**
 * Normaliza o nome do e-commerce/canal de venda que a Tiny/Olist devolve em
 * `pedido.ecommerce.nomeEcommerce`/`canalVenda` (texto livre, varia de formatação) pra um
 * enum fixo. Usado pra aplicar a regra de SLA de postagem específica de cada marketplace.
 */
export function normalizeCanalVenda(
  nomeEcommerce: string | null | undefined,
  canalVenda?: string | null | undefined
): CanalVenda {
  const m = `${nomeEcommerce ?? ""} ${canalVenda ?? ""}`.toLowerCase();
  if (!m.trim()) return "outro";
  if (m.includes("shopee")) return "shopee";
  if (m.includes("mercado livre") || m.includes("mercadolivre") || m.includes("mercado_livre")) return "mercado_livre";
  if (m.includes("shein")) return "shein";
  if (m.includes("tiktok")) return "tiktok_shop";
  return "outro";
}

type PesquisaPedidosResponse = TinyRetornoBase & {
  pagina?: number;
  numero_paginas?: number;
  pedidos?: Array<{ pedido?: OlistPedidoResumo }>;
};

type ObterPedidoResponse = TinyRetornoBase & {
  pedido?: {
    id?: number;
    numero?: number;
    numero_ecommerce?: string;
    situacao?: string;
    codigo_rastreamento?: string;
    data_pedido?: string;
    forma_envio?: string;
    cliente?: {
      nome?: string;
      cidade?: string;
      uf?: string;
      fone?: string;
    };
    endereco_entrega?: {
      nome_destinatario?: string;
      cidade?: string;
      uf?: string;
      fone?: string;
    };
    ecommerce?: {
      id?: number | string;
      numeroPedidoEcommerce?: string;
      numeroPedidoCanalVenda?: string;
      nomeEcommerce?: string;
      canalVenda?: string;
    };
    itens?: Array<{
      item?: {
        id_produto?: number;
        codigo?: string;
        descricao?: string;
        quantidade?: string | number;
      };
    }>;
  };
};

type AtualizarEstoqueResponse = TinyRetornoBase & {
  registros?: Array<{
    registro?: {
      status?: string;
      erros?: Array<{ erro?: string }>;
      saldoEstoque?: string | number;
    };
  }>;
};

function toTinyDecimal(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Preço retornado/enviado à API Tiny (aceita `35.65` ou `35,65`). */
export function parseTinyPreco(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function precoTinyMatches(esperado: string, retornado: unknown, tolerancia = 0.02): boolean {
  const a = parseTinyPreco(esperado);
  const b = parseTinyPreco(retornado);
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerancia;
}

function mapPedidoResumo(raw: OlistPedidoResumo | undefined): OlistPedidoResumo | null {
  const idRaw = raw?.id;
  const id = typeof idRaw === "number" ? idRaw : typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : Number.NaN;
  if (!raw || !Number.isFinite(id)) return null;
  return {
    id,
    numero: typeof raw.numero === "number" ? raw.numero : null,
    numero_ecommerce: raw.numero_ecommerce?.trim() || null,
    situacao: raw.situacao?.trim() || null,
    codigo_rastreamento: raw.codigo_rastreamento?.trim() || null,
    data_pedido: raw.data_pedido?.trim() || null,
  };
}

export type PesquisarPedidosOlistParams =
  | { dataAtualizacao: Date; pagina?: number }
  | { dataInicial: Date; dataFinal: Date; pagina?: number };

export async function pesquisarPedidosOlist(
  apiToken: string,
  params: PesquisarPedidosOlistParams
): Promise<{ pedidos: OlistPedidoResumo[]; pagina: number; numero_paginas: number }> {
  const token = apiToken.trim();
  if (!token) {
    throw new Error("Informe o token API da Olist/Tiny.");
  }

  const body = new URLSearchParams({
    token,
    formato: "JSON",
    pagina: String(Math.max(1, params.pagina ?? 1)),
  });

  if ("dataAtualizacao" in params) {
    body.set("dataAtualizacao", formatTinyApiDateTime(params.dataAtualizacao));
  } else {
    body.set("dataInicial", formatTinyApiDate(params.dataInicial));
    body.set("dataFinal", formatTinyApiDate(params.dataFinal));
  }

  const res = await fetch(`${TINY_API2_BASE}/pedidos.pesquisa.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`A Olist/Tiny respondeu com HTTP ${res.status} em pedidos.pesquisa.php.`);
  }

  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<PesquisaPedidosResponse>(json);
  if (!retorno) {
    throw new Error("Resposta inválida da Olist/Tiny ao pesquisar pedidos.");
  }

  if (!isTinyRetornoOk(retorno)) {
    if (isTinyNoRecords(retorno)) {
      return {
        pedidos: [],
        pagina: Number(retorno.pagina ?? params.pagina ?? 1),
        numero_paginas: Math.max(1, Number(retorno.numero_paginas ?? 1)),
      };
    }
    throw new Error(readTinyErrors(retorno));
  }

  const pedidos =
    retorno.pedidos
      ?.map((row) => mapPedidoResumo(row.pedido))
      .filter((p): p is OlistPedidoResumo => p != null) ?? [];

  return {
    pedidos,
    pagina: Number(retorno.pagina ?? params.pagina ?? 1),
    numero_paginas: Math.max(1, Number(retorno.numero_paginas ?? 1)),
  };
}

function parseTinyPedidoId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function obterPedidoOlist(apiToken: string, pedidoId: number): Promise<OlistPedidoDetalhe> {
  const json = await postTinyApi2Form<ObterPedidoResponse>("pedido.obter.php", apiToken, {
    id: String(pedidoId),
  });

  const pedido = json.pedido;
  const pedidoIdParsed = parseTinyPedidoId(pedido?.id);
  if (!pedido || pedidoIdParsed == null) {
    throw new Error("Pedido não encontrado na Olist/Tiny.");
  }

  const itens: OlistPedidoItem[] = [];
  const rawItens =
    pedido.itens
      ?.map((row) => row.item)
      .filter((item): item is NonNullable<typeof item> => !!item) ?? [];

  for (const item of rawItens) {
    let codigo = item.codigo?.trim() || null;
    const idProduto = typeof item.id_produto === "number" ? item.id_produto : null;
    if (!codigo && idProduto) {
      const prod = await obterProdutoOlistPorId(apiToken, idProduto);
      codigo = prod?.codigo?.trim() || null;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!codigo) continue;
    itens.push({
      id_produto: idProduto,
      codigo,
      descricao: item.descricao?.trim() || null,
      quantidade: Math.max(1, Math.floor(toTinyDecimal(item.quantidade))),
    });
  }

  return {
    id: pedidoIdParsed,
    numero: typeof pedido.numero === "number" ? pedido.numero : null,
    numero_ecommerce: pedido.numero_ecommerce?.trim() || null,
    situacao: pedido.situacao?.trim() || null,
    codigo_rastreamento: pedido.codigo_rastreamento?.trim() || null,
    data_pedido: pedido.data_pedido?.trim() || null,
    forma_envio: pedido.forma_envio?.trim() || null,
    canal_venda: normalizeCanalVenda(pedido.ecommerce?.nomeEcommerce, pedido.ecommerce?.canalVenda),
    itens,
    comprador_nome:
      pedido.endereco_entrega?.nome_destinatario?.trim() ||
      pedido.cliente?.nome?.trim() ||
      null,
    comprador_cidade:
      pedido.endereco_entrega?.cidade?.trim() || pedido.cliente?.cidade?.trim() || null,
    comprador_uf: pedido.endereco_entrega?.uf?.trim() || pedido.cliente?.uf?.trim() || null,
    comprador_fone: pedido.endereco_entrega?.fone?.trim() || pedido.cliente?.fone?.trim() || null,
  };
}

async function lancarEstoqueOlistProduto(
  apiToken: string,
  params: { idProduto: number; tipo: "B" | "S" | "E"; quantidade: number; observacoes?: string | null },
): Promise<{ saldoEstoque: number | null }> {
  const quantidade = Math.max(0, params.quantidade);
  if (params.tipo !== "B" && quantidade <= 0) {
    return { saldoEstoque: null };
  }

  const estoquePayload = {
    estoque: {
      idProduto: params.idProduto,
      tipo: params.tipo,
      quantidade: formatTinyEstoqueQuantidade(quantidade),
      observacoes: params.observacoes?.trim()?.slice(0, 100) || "DropCore sync Olist/Tiny",
    },
  };

  const json = await postTinyApi2Form<AtualizarEstoqueResponse>("produto.atualizar.estoque.php", apiToken, {
    estoque: JSON.stringify(estoquePayload),
  });

  const registro = json.registros?.[0]?.registro;
  if (registro?.status && registro.status !== "OK") {
    const msg = registro.erros?.map((e) => e.erro).filter(Boolean).join(" ");
    throw new Error(msg?.trim() || "Erro ao atualizar estoque na Olist/Tiny.");
  }

  const saldo = registro?.saldoEstoque;
  return {
    saldoEstoque: saldo == null ? null : toTinyDecimal(saldo),
  };
}

/** Quantidade para API Tiny (estoque usa ponto decimal; balanço aceita inteiro). */
export function formatTinyEstoqueQuantidade(value: number): string {
  const n = Math.max(0, value);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
}

/** Define saldo absoluto na Olist (tipo B — fonte: estoque central DropCore). */
export async function definirSaldoEstoqueOlistProduto(
  apiToken: string,
  params: { idProduto: number; saldo: number; observacoes?: string | null },
): Promise<{ saldoEstoque: number | null }> {
  return lancarEstoqueOlistProduto(apiToken, {
    idProduto: params.idProduto,
    tipo: "B",
    quantidade: params.saldo,
    observacoes: params.observacoes,
  });
}

export async function lancarSaidaEstoqueOlistProduto(
  apiToken: string,
  params: { idProduto: number; quantidade: number; observacoes?: string | null },
): Promise<{ saldoEstoque: number | null }> {
  return lancarEstoqueOlistProduto(apiToken, {
    idProduto: params.idProduto,
    tipo: "S",
    quantidade: params.quantidade,
    observacoes: params.observacoes,
  });
}

type PesquisaProdutosResponse = TinyRetornoBase & {
  pagina?: number;
  numero_paginas?: number;
  produtos?: Array<{
    produto?: {
      id?: number;
      codigo?: string;
      tipoVariacao?: string;
      situacao?: string;
    };
  }>;
};

type ExpedicaoObterResponse = TinyRetornoBase & {
  expedicao?: {
    id?: number;
    idAgrupamento?: number;
    idObjeto?: number;
    tipoObjeto?: string;
  };
};

type EtiquetasImpressaoResponse = TinyRetornoBase & {
  links?: Array<{ link?: string } | string>;
};

/** Pesquisa produtos sem lançar erro quando a Olist não retorna registros. */
async function pesquisarProdutosOlistPagina(
  apiToken: string,
  fields: Record<string, string>,
): Promise<PesquisaProdutosResponse | null> {
  const token = apiToken.trim();
  if (!token) return null;

  const body = new URLSearchParams({
    token,
    formato: "JSON",
    ...fields,
  });

  try {
    const res = await fetch(`${TINY_API2_BASE}/produtos.pesquisa.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = await readTinyHttpJson(res);
    const retorno = unwrapTinyRetorno<PesquisaProdutosResponse>(json);
    if (!retorno) return null;
    if (isTinyNoRecords(retorno)) return { ...retorno, produtos: [] };
    const codigoErro = Number(retorno.codigo_erro);
    if (codigoErro === 21 && (retorno.produtos?.length ?? 0) > 0) return retorno;
    if (!isTinyRetornoOk(retorno)) return null;
    return retorno;
  } catch {
    return null;
  }
}

function idProdutoFromPesquisaRow(
  row: NonNullable<PesquisaProdutosResponse["produtos"]>[number] | undefined,
): number | null {
  const p = row?.produto;
  const id = typeof p?.id === "number" ? p.id : Number.parseInt(String(p?.id ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizarCodigoOlist(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

/** Termos alternativos — a pesquisa Tiny/Olist às vezes não acha o SKU completo …000. */
export function termosPesquisaOlistPorCodigo(codigo: string): string[] {
  const c = codigo.trim().toUpperCase();
  if (!c) return [];
  const out = new Set<string>([c]);
  if (c.length > 3 && c.endsWith("000")) {
    out.add(c.slice(0, -3));
  }
  const m = c.match(/^([A-Z]+)(\d+)$/);
  if (m) {
    const prefix = m[1];
    const digits = m[2];
    if (digits.length >= 3) out.add(`${prefix}${digits.slice(0, 3)}`);
    if (digits.length >= 6) out.add(`${prefix}${digits.slice(0, 6)}`);
  }
  return [...out];
}

export function codigoOlistMatchesSku(codigoApi: unknown, sku: string): boolean {
  const a = normalizarCodigoOlist(codigoApi);
  const b = normalizarCodigoOlist(sku);
  if (!a || !b) return false;
  return a === b;
}

/** Mesmo grupo de grade DropCore/Olist (prefixo antes dos 3 últimos dígitos). */
function mesmoGrupoSkuOlist(a: string, b: string): boolean {
  const x = normalizarCodigoOlist(a);
  const y = normalizarCodigoOlist(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 3 && y.length >= 3) return x.slice(0, -3) === y.slice(0, -3);
  return false;
}

function produtoOlistContemCodigoSku(
  prod: OlistProdutoOlistDetalhe | null | undefined,
  sku: string,
): boolean {
  if (!prod) return false;
  const upper = normalizarCodigoOlist(sku);
  if (!upper) return false;
  if (codigoOlistMatchesSku(prod.codigo, upper)) return true;
  for (const row of prod.variacoes ?? []) {
    if (codigoOlistMatchesSku(row.variacao?.codigo, upper)) return true;
  }
  return false;
}

function produtoOlistParecePaiGrade(prod: OlistProdutoOlistDetalhe | null | undefined): boolean {
  if (!prod) return false;
  const tipo = String(prod.tipoVariacao ?? "").toUpperCase();
  const classe = String(prod.classe_produto ?? "").toUpperCase();
  return tipo === "P" || classe === "V" || (prod.variacoes?.length ?? 0) > 0;
}

function normalizarGradeOlistValor(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function gradeMapFromOlistVariacao(v: Record<string, unknown> | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const grade = v?.grade;
  if (Array.isArray(grade)) {
    for (const row of grade) {
      const chave = normalizarGradeOlistValor((row as { chave?: string }).chave);
      const valor = normalizarGradeOlistValor((row as { valor?: string }).valor);
      if (chave && valor) map.set(chave, valor);
    }
  } else if (grade && typeof grade === "object") {
    for (const [k, val] of Object.entries(grade as Record<string, string>)) {
      const chave = normalizarGradeOlistValor(k);
      const valor = normalizarGradeOlistValor(val);
      if (chave && valor) map.set(chave, valor);
    }
  }
  return map;
}

function gradeValorCompat(grade: Map<string, string>, alvo: string, chaves: string[]): boolean {
  const want = normalizarGradeOlistValor(alvo);
  if (!want) return true;
  for (const key of chaves) {
    const got = grade.get(key) ?? "";
    if (!got) continue;
    if (got === want || got.includes(want) || want.includes(got)) return true;
  }
  for (const got of grade.values()) {
    if (got === want || got.includes(want) || want.includes(got)) return true;
  }
  return false;
}

function variacaoOlistMatchesFilho(
  v: Record<string, unknown> | undefined,
  opts: { sku: string; cor?: string | null; tamanho?: string | null },
): boolean {
  if (!v) return false;
  if (codigoOlistMatchesSku(v.codigo, opts.sku)) return true;
  const grade = gradeMapFromOlistVariacao(v);
  if (grade.size === 0) return false;
  const cor = str(opts.cor);
  const tam = str(opts.tamanho);
  if (!cor && !tam) return false;
  return gradeValorCompat(grade, cor, ["cor"]) && gradeValorCompat(grade, tam, ["tamanho", "tam", "size"]);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Saldo de um SKU filho dentro de um produto Olist já carregado (pai ou avulso). */
export function extrairSaldoEstoqueSkuDoProdutoOlist(
  prod: OlistProdutoOlistDetalhe | null | undefined,
  opts: { sku: string; cor?: string | null; tamanho?: string | null },
): number | null {
  if (!prod) return null;
  const sku = normalizarCodigoOlist(opts.sku);
  if (!sku) return null;

  if (codigoOlistMatchesSku(prod.codigo, sku)) {
    const saldo = extrairSaldoEstoqueOlistRow(prod as Record<string, unknown>);
    return saldo ?? 0;
  }

  for (const row of prod.variacoes ?? []) {
    const v = row.variacao as Record<string, unknown> | undefined;
    if (!v || !variacaoOlistMatchesFilho(v, opts)) continue;
    const fromVar = extrairSaldoEstoqueOlistRow(v);
    return fromVar ?? 0;
  }

  return null;
}

function paiKeyFromCodigoOlist(codigo: string): string | null {
  const upper = normalizarCodigoOlist(codigo);
  if (!upper || upper.endsWith("000") || upper.length <= 3) return null;
  return `${upper.slice(0, -3)}000`;
}

function lerIdProdutoPaiOlist(prod: OlistProdutoOlistDetalhe | null | undefined): number | null {
  if (!prod) return null;
  const rec = prod as Record<string, unknown>;
  const raw = prod.idProdutoPai ?? rec.id_produto_pai;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function pesquisarIdProdutoOlistPorTermos(
  apiToken: string,
  skuAlvo: string,
  termos: string[],
): Promise<number | null> {
  const upper = normalizarCodigoOlist(skuAlvo);
  const filtros: Array<Record<string, string>> = [{}, { situacao: "A" }, { situacao: "I" }];

  for (const termo of termos) {
    if (!termo.trim()) continue;
    for (const extra of filtros) {
      for (let pagina = 1; pagina <= 8; pagina += 1) {
        const retorno = await pesquisarProdutosOlistPagina(apiToken, {
          pesquisa: termo,
          pagina: String(pagina),
          ...extra,
        });
        const rows = retorno?.produtos ?? [];
        if (rows.length === 0) break;

        for (const row of rows) {
          const id = idProdutoFromPesquisaRow(row);
          if (id == null) continue;
          const cod = normalizarCodigoOlist(row?.produto?.codigo);
          if (codigoOlistMatchesSku(cod, upper)) return id;
          // Import Olist (tipo V + filhos S): pesquisa lista o pai …000; o alvo pode ser variação …001.
          if (mesmoGrupoSkuOlist(cod, upper)) {
            const prod = await obterProdutoOlistPorId(apiToken, id);
            if (produtoOlistContemCodigoSku(prod, upper)) return id;
          }
        }

        const numPages = retorno?.numero_paginas ?? 1;
        if (pagina >= numPages) break;
      }
    }
  }

  return null;
}

/** Resolve id do produto na Olist pelo código (SKU), quando o pedido não traz id_produto no item. */
export async function resolverIdProdutoOlistPorCodigo(apiToken: string, codigo: string): Promise<number | null> {
  const c = codigo.trim();
  if (!c) return null;
  const upper = normalizarCodigoOlist(c);
  const fromSearch = await pesquisarIdProdutoOlistPorTermos(apiToken, c, termosPesquisaOlistPorCodigo(c));
  if (fromSearch) return fromSearch;

  const paiKey = paiKeyFromCodigoOlist(upper);
  if (!paiKey) return null;
  const paiId = await pesquisarIdProdutoOlistPorTermos(apiToken, paiKey, termosPesquisaOlistPorCodigo(paiKey));
  if (!paiId) return null;
  const prod = await obterProdutoOlistPorId(apiToken, paiId);
  return produtoOlistContemCodigoSku(prod, upper) ? paiId : null;
}

/**
 * Resolve o id do produto pai na Olist (grade). A pesquisa pelo SKU …000 às vezes não retorna o pai;
 * nesse caso localiza uma variação filha e usa idProdutoPai do produto.obter.
 */
export async function resolverIdProdutoPaiOlistPorGrupo(
  apiToken: string,
  paiKey: string,
  childSkus: string[],
): Promise<number | null> {
  const pai = paiKey.trim().toUpperCase();
  if (!pai) return null;

  const direct = await pesquisarIdProdutoOlistPorTermos(apiToken, pai, termosPesquisaOlistPorCodigo(pai));
  if (direct) {
    const prodPai = await obterProdutoOlistPorId(apiToken, direct);
    if (
      prodPai &&
      (codigoOlistMatchesSku(prodPai.codigo, pai) || produtoOlistParecePaiGrade(prodPai))
    ) {
      return direct;
    }
  }

  for (const raw of childSkus) {
    const sku = raw.trim().toUpperCase();
    if (!sku || sku.endsWith("000")) continue;

    const childId =
      (await pesquisarIdProdutoOlistPorTermos(apiToken, sku, [sku])) ??
      (await resolverIdProdutoOlistPorCodigo(apiToken, sku));
    if (!childId) continue;

    const prod = await obterProdutoOlistPorId(apiToken, childId);
    if (!prod) continue;

    const tipo = String(prod.tipoVariacao ?? "").toUpperCase();
    if (tipo === "P" && codigoOlistMatchesSku(prod.codigo, pai)) {
      const id = typeof prod.id === "number" ? prod.id : childId;
      return id > 0 ? id : null;
    }

    const paiId = lerIdProdutoPaiOlist(prod);
    if (paiId) return paiId;
  }

  return null;
}

/** Expedição vinculada ao pedido de venda (necessária para etiquetas de impressão na Olist). */
export async function obterExpedicaoPorPedidoVenda(
  apiToken: string,
  pedidoId: number
): Promise<{ id: number; idAgrupamento?: number } | null> {
  const token = apiToken.trim();
  if (!token || !Number.isFinite(pedidoId)) return null;
  const body = new URLSearchParams({
    token,
    formato: "JSON",
    tipoObjeto: "venda",
    idObjeto: String(pedidoId),
  });
  const res = await fetch(`${TINY_API2_BASE}/expedicao.obter.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<ExpedicaoObterResponse>(json);
  if (!retorno || !isTinyRetornoOk(retorno)) return null;
  const exp = retorno.expedicao;
  if (!exp) return null;
  const id = typeof exp.id === "number" ? exp.id : Number.parseInt(String(exp.id ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const idAgrupamentoRaw =
    typeof exp.idAgrupamento === "number" ? exp.idAgrupamento : Number.parseInt(String(exp.idAgrupamento ?? ""), 10);
  const idAgrupamento = Number.isFinite(idAgrupamentoRaw) && idAgrupamentoRaw > 0 ? idAgrupamentoRaw : undefined;
  return { id, idAgrupamento };
}

type EnviarObjetosExpedicaoResponse = TinyRetornoBase & {
  objetos?: Array<{
    objeto?: {
      idObjeto?: number | string;
      idExpedicao?: number | string;
      sucesso?: number | string;
      erro?: string;
    };
  }>;
};

/**
 * Envia o pedido de venda pra expedição na Olist/Tiny — mesma ação que o painel faz ao
 * vincular a forma de envio do marketplace (Shopee Envios, Mercado Envios etc.) na
 * importação. Sem isso, expedicao.obter.php nunca encontra nada: a expedição (e a
 * etiqueta oficial que ela guarda) só passa a existir depois desse envio.
 * @see https://tiny.com.br/api-docs/api2-enviar-objetos-para-expedicao
 */
export async function enviarPedidoVendaParaExpedicaoOlist(
  apiToken: string,
  pedidoId: number
): Promise<{ idExpedicao: number | null; erro: string | null }> {
  const token = apiToken.trim();
  if (!token || !Number.isFinite(pedidoId)) return { idExpedicao: null, erro: "Token ou pedido inválido." };

  const retorno = await postTinyApi2Form<EnviarObjetosExpedicaoResponse>("expedicao.liberar.objetos.php", token, {
    idObjetos: String(pedidoId),
    tipoObjetos: "venda",
  });

  const objeto = retorno.objetos?.[0]?.objeto;
  if (!objeto) {
    return { idExpedicao: null, erro: isTinyRetornoOk(retorno) ? null : readTinyErrors(retorno) };
  }

  const sucesso = Number(objeto.sucesso) === 1 || String(objeto.sucesso).trim() === "1";
  if (!sucesso) {
    return { idExpedicao: null, erro: objeto.erro?.trim() || "Falha ao enviar pedido para expedição na Olist." };
  }

  const idExpedicao =
    typeof objeto.idExpedicao === "number" ? objeto.idExpedicao : Number.parseInt(String(objeto.idExpedicao ?? ""), 10);
  return { idExpedicao: Number.isFinite(idExpedicao) && idExpedicao > 0 ? idExpedicao : null, erro: null };
}

function coletarLinksEtiquetasRetorno(retorno: EtiquetasImpressaoResponse): string[] {
  const out: string[] = [];
  for (const row of retorno.links ?? []) {
    if (typeof row === "string" && row.trim()) {
      out.push(row.trim());
      continue;
    }
    if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      for (const k of ["link", "Link", "url", "URL"]) {
        const v = r[k];
        if (typeof v === "string" && v.trim()) {
          out.push(v.trim());
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Links temporários para PDF de etiquetas (expedição na Olist — inclui fluxos de marketplace quando a Olist já gerou a expedição).
 * @see https://tiny.com.br/api-docs/api2-expedicao-obter-etiquetas-impressao
 */
export async function obterLinksEtiquetasImpressaoOlist(
  apiToken: string,
  opts: { idExpedicao?: number; idAgrupamento?: number }
): Promise<string[]> {
  const token = apiToken.trim();
  if (!token) return [];

  const tentar = async (fields: Record<string, string>) => {
    const retorno = await postTinyApi2Form<EtiquetasImpressaoResponse>("expedicao.obter.etiquetas.impressao.php", token, fields);
    return coletarLinksEtiquetasRetorno(retorno);
  };

  try {
    if (opts.idExpedicao && opts.idExpedicao > 0) {
      const links = await tentar({ idExpedicao: String(opts.idExpedicao) });
      if (links.length) return links;
    }
  } catch {
    /* tenta agrupamento */
  }

  try {
    if (opts.idAgrupamento && opts.idAgrupamento > 0) {
      return await tentar({ idAgrupamento: String(opts.idAgrupamento) });
    }
  } catch {
    return [];
  }
  return [];
}

const MAX_ETIQUETA_PDF_BYTES = Math.floor(1.35 * 1024 * 1024);

/** Baixa URL (link temporário da Olist) e devolve base64 do PDF, com limite de tamanho para gravar no Postgres. */
export async function fetchUrlAsPdfBase64(url: string, maxBytes = MAX_ETIQUETA_PDF_BYTES): Promise<string | null> {
  const u = url.trim();
  if (!u.startsWith("http")) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > maxBytes) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const looksPdf =
      ct.includes("pdf") ||
      ct.includes("octet-stream") ||
      u.toLowerCase().includes(".pdf") ||
      u.toLowerCase().includes("pdf");
    if (!looksPdf) return null;
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type OlistAlterarVariacaoPayload = {
  id?: number;
  codigo?: string;
  preco?: string;
};

export type OlistAlterarProdutoPayload = {
  sequencia: number;
  id?: number;
  codigo: string;
  nome: string;
  unidade: string;
  preco: string;
  preco_custo: string;
  origem: string;
  situacao: string;
  tipo: string;
  variacoes?: Array<{ variacao: OlistAlterarVariacaoPayload }>;
  /** URLs públicas — Olist baixa via imagens_externas no produto.alterar. */
  imagens_externas?: string[];
};

type AlterarProdutosResponse = TinyRetornoBase & {
  registros?: Array<{
    registro?: {
      sequencia?: number;
      status?: string;
      id?: number;
      erros?: Array<{ erro?: string }>;
      variacoes?: Array<{
        variacao?: {
          id?: number;
          status?: string;
          erros?: Array<{ erro?: string }>;
        };
      }>;
    };
  }>;
};

type ObterProdutoOlistResponse = TinyRetornoBase & {
  produto?: {
    id?: number;
    codigo?: string;
    nome?: string;
    unidade?: string;
    preco?: string | number;
    preco_custo?: string | number;
    origem?: string;
    situacao?: string;
    tipoVariacao?: string;
    classe_produto?: string;
    idProdutoPai?: number | string;
    variacoes?: Array<{
      variacao?: {
        id?: number;
        codigo?: string;
        preco?: string | number;
        saldo?: string | number;
        saldoEstoque?: string | number;
        estoque?: string | number;
        grade?: Record<string, string> | Array<{ chave?: string; valor?: string }>;
      };
    }>;
    saldo?: string | number;
    saldoEstoque?: string | number;
    estoque?: string | number;
  };
};

export type OlistProdutoOlistDetalhe = NonNullable<ObterProdutoOlistResponse["produto"]>;

/** Carrega produto na Olist/Tiny (inclui variações quando tipoVariacao = P). */
export async function obterProdutoOlistPorId(apiToken: string, produtoId: number): Promise<OlistProdutoOlistDetalhe | null> {
  if (!Number.isFinite(produtoId) || produtoId <= 0) return null;
  try {
    const json = await postTinyApi2Form<ObterProdutoOlistResponse>("produto.obter.php", apiToken, {
      id: String(produtoId),
    });
    return json.produto ?? null;
  } catch {
    return null;
  }
}

function extrairSaldoEstoqueOlistRow(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null;
  for (const key of ["saldo", "saldoEstoque", "estoque", "estoque_atual"]) {
    const raw = row[key];
    if (raw == null || raw === "") continue;
    const n = toTinyDecimal(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
}

function paiKeyDropCore(codigo: string): string {
  const s = normalizarCodigoOlist(codigo);
  return s.length >= 3 ? `${s.slice(0, -3)}000` : s;
}

function prefixosPesquisaDeSkus(skus: string[]): string[] {
  const out = new Set<string>();
  for (const raw of skus) {
    const s = normalizarCodigoOlist(raw);
    if (!s) continue;
    out.add(s);
    out.add(paiKeyDropCore(s));
    if (s.length >= 6) out.add(s.slice(0, 6));
  }
  return [...out];
}

function sleepOlistApi(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OlistIndiceEstoqueCatalogo = {
  saldoPorCodigo: Map<string, number>;
  paisPorGrupo: Map<string, OlistProdutoOlistDetalhe>;
};

export type OlistIndiceEstoqueItem = {
  sku: string;
  cor?: string | null;
  tamanho?: string | null;
};

/** Monta índice SKU→saldo: busca por pai …000 (grade CSV) e fallback por SKU avulso. */
export async function montarIndiceEstoqueOlistCatalogo(
  apiToken: string,
  opts: { itens: OlistIndiceEstoqueItem[]; pauseMs?: number },
): Promise<OlistIndiceEstoqueCatalogo> {
  const pauseMs = opts.pauseMs ?? 220;
  const saldoPorCodigo = new Map<string, number>();
  const paisPorGrupo = new Map<string, OlistProdutoOlistDetalhe>();
  const itens = opts.itens
    .map((i) => ({
      sku: normalizarCodigoOlist(i.sku),
      cor: i.cor ?? null,
      tamanho: i.tamanho ?? null,
    }))
    .filter((i) => i.sku);

  const filhosPorPai = new Map<string, Array<{ sku: string; cor: string | null; tamanho: string | null }>>();
  for (const item of itens) {
    const pai = paiKeyDropCore(item.sku);
    const list = filhosPorPai.get(pai) ?? [];
    list.push(item);
    filhosPorPai.set(pai, list);
  }

  async function indexarProdutoPai(paiKey: string, childSkus: string[]): Promise<void> {
    if (paisPorGrupo.has(paiKey)) return;
    const parentId = await resolverIdProdutoPaiOlistPorGrupo(apiToken, paiKey, childSkus);
    if (!parentId) return;

    const prod = await obterProdutoOlistPorId(apiToken, parentId);
    if (!prod) return;

    paisPorGrupo.set(paiKey, prod);
    const paiCod = normalizarCodigoOlist(prod.codigo);
    if (paiCod) {
      saldoPorCodigo.set(paiCod, extrairSaldoEstoqueOlistRow(prod as Record<string, unknown>) ?? 0);
    }

    for (const row of prod.variacoes ?? []) {
      const v = row.variacao as Record<string, unknown> | undefined;
      if (!v) continue;
      const codVar = normalizarCodigoOlist(v.codigo);
      if (codVar) saldoPorCodigo.set(codVar, extrairSaldoEstoqueOlistRow(v) ?? 0);
    }

    await sleepOlistApi(pauseMs);
  }

  for (const [paiKey, grupo] of filhosPorPai) {
    await indexarProdutoPai(
      paiKey,
      grupo.map((g) => g.sku),
    );
  }

  for (const item of itens) {
    if (saldoPorCodigo.has(item.sku)) continue;

    const paiKey = paiKeyDropCore(item.sku);
    const fromPai = extrairSaldoEstoqueSkuDoProdutoOlist(paisPorGrupo.get(paiKey), item);
    if (fromPai != null) {
      saldoPorCodigo.set(item.sku, fromPai);
      continue;
    }

    const id =
      (await pesquisarIdProdutoOlistPorTermos(apiToken, item.sku, [item.sku])) ??
      (await resolverIdProdutoOlistPorCodigo(apiToken, item.sku));
    if (!id) continue;

    const prod = await obterProdutoOlistPorId(apiToken, id);
    if (!prod) continue;

    const saldo =
      extrairSaldoEstoqueSkuDoProdutoOlist(prod, item) ??
      (codigoOlistMatchesSku(prod.codigo, item.sku)
        ? extrairSaldoEstoqueOlistRow(prod as Record<string, unknown>) ?? 0
        : null);
    if (saldo != null) saldoPorCodigo.set(item.sku, saldo);

    await sleepOlistApi(pauseMs);
  }

  return { saldoPorCodigo, paisPorGrupo };
}

export function resolverSaldoIndiceEstoqueOlist(
  indice: OlistIndiceEstoqueCatalogo,
  row: { sku: string; cor?: string | null; tamanho?: string | null },
): number | null {
  const sku = normalizarCodigoOlist(row.sku);
  if (!sku) return null;
  const direto = indice.saldoPorCodigo.get(sku);
  if (direto != null) return direto;

  const prodPai = indice.paisPorGrupo.get(paiKeyDropCore(sku));
  if (!prodPai) return null;

  return extrairSaldoEstoqueSkuDoProdutoOlist(prodPai, {
    sku,
    cor: row.cor,
    tamanho: row.tamanho,
  });
}

/** Id para produto.atualizar.estoque — variação filha em grade, senão o produto avulso. */
export async function resolverIdEstoqueOlistPorCodigo(
  apiToken: string,
  codigo: string,
  opts?: { cor?: string | null; tamanho?: string | null },
): Promise<number | null> {
  const upper = normalizarCodigoOlist(codigo);
  if (!upper) return null;

  const id = await resolverIdProdutoOlistPorCodigo(apiToken, upper);
  if (!id) return null;

  const prod = await obterProdutoOlistPorId(apiToken, id);
  if (!prod) return id;

  if (codigoOlistMatchesSku(prod.codigo, upper)) return id;

  for (const row of prod.variacoes ?? []) {
    const v = row.variacao as Record<string, unknown> | undefined;
    if (!v || !variacaoOlistMatchesFilho(v, { sku: upper, cor: opts?.cor, tamanho: opts?.tamanho })) continue;
    const idVar = typeof v.id === "number" ? v.id : Number.parseInt(String(v.id ?? ""), 10);
    if (Number.isFinite(idVar) && idVar > 0) return idVar;
  }

  return id;
}

/** Lê saldo de estoque na Olist pelo código SKU (produto ou variação). */
export async function lerSaldoEstoqueOlistPorCodigo(
  apiToken: string,
  codigo: string,
  opts?: { cor?: string | null; tamanho?: string | null },
): Promise<number | null> {
  const codigoNorm = codigo.trim().toUpperCase();
  if (!codigoNorm) return null;

  const id = await resolverIdProdutoOlistPorCodigo(apiToken, codigoNorm);
  if (!id) return null;

  const prod = await obterProdutoOlistPorId(apiToken, id);
  if (!prod) return null;

  const fromProd = extrairSaldoEstoqueSkuDoProdutoOlist(prod, {
    sku: codigoNorm,
    cor: opts?.cor,
    tamanho: opts?.tamanho,
  });
  if (fromProd != null) return fromProd;

  return extrairSaldoEstoqueOlistRow(prod as Record<string, unknown>);
}

type AtualizarPrecosResponse = TinyRetornoBase & {
  registros?: Array<{
    registro?: {
      sequencia?: number;
      status?: string;
      id?: number;
      preco?: string | number;
      preco_promocional?: string | number;
      codigo_erro?: number | string;
      erros?: Array<{ erro?: string; campo?: string }>;
    };
  }>;
};

/** Atualiza preço de venda por id de produto/variação (produto.atualizar.precos.php). */
export type OlistPrecoUpdateInput = { id: number; preco: string; sku?: string };

export function countAtualizarPrecosOk(
  items: OlistPrecoUpdateInput[],
  registros: AtualizarPrecosResponse["registros"],
): { ok: number; falhas: Array<{ sku: string; erro: string }> } {
  const idToItem = new Map(items.map((p) => [p.id, p]));
  const falhas: Array<{ sku: string; erro: string }> = [];
  let ok = 0;

  if (!registros?.length) {
    return {
      ok: 0,
      falhas: items.map((p) => ({
        sku: p.sku ?? String(p.id),
        erro: "Olist não confirmou a atualização de preço.",
      })),
    };
  }

  const seenIds = new Set<number>();
  for (const row of registros) {
    const reg = row.registro;
    if (!reg) continue;
    const id = typeof reg.id === "number" ? reg.id : Number.parseInt(String(reg.id ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    seenIds.add(id);
    const item = idToItem.get(id);
    const sku = item?.sku ?? String(id);
    if (String(reg.status ?? "").toUpperCase() === "OK") {
      const esperado = item?.preco;
      if (esperado && reg.preco != null && !precoTinyMatches(esperado, reg.preco)) {
        falhas.push({
          sku,
          erro: `Olist respondeu OK mas manteve preço ${String(reg.preco)} (esperado ${esperado}).`,
        });
      } else {
        ok += 1;
      }
    } else {
      const msg =
        reg.erros?.map((e) => e.erro).filter(Boolean).join(" ") ||
        (reg.codigo_erro != null ? `Código erro Olist: ${reg.codigo_erro}` : "Erro ao atualizar preço na Olist.");
      falhas.push({ sku, erro: msg.trim() });
    }
  }

  for (const p of items) {
    if (!seenIds.has(p.id)) {
      falhas.push({ sku: p.sku ?? String(p.id), erro: "Preço não confirmado pela Olist (sem retorno do id)." });
    }
  }

  return { ok, falhas };
}

/** Menor preço de venda entre variações (grade) — costuma ser o valor da lista na Olist. */
export function menorPrecoVariacoesOlist(produto: OlistProdutoOlistDetalhe | null | undefined): number | null {
  let min: number | null = null;
  for (const row of produto?.variacoes ?? []) {
    const p = parseTinyPreco(row?.variacao?.preco);
    if (p == null) continue;
    min = min == null ? p : Math.min(min, p);
  }
  return min;
}

export async function atualizarPrecosOlistLote(
  apiToken: string,
  precos: Array<{ id: number; preco: string }>,
): Promise<AtualizarPrecosResponse> {
  const token = apiToken.trim();
  if (!token) throw new Error("Informe o token API da Olist/Tiny.");
  if (precos.length === 0) return { status: "OK", status_processamento: 3, registros: [] };

  const payload = {
    precos: precos.map((p) => ({
      id: p.id,
      preco: parseFloat(p.preco.replace(",", ".")),
    })),
  };

  const res = await fetch(`${TINY_API2_BASE}/produto.atualizar.precos.php?token=${encodeURIComponent(token)}&formato=JSON`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`A Olist/Tiny respondeu com HTTP ${res.status} em produto.atualizar.precos.php.`);
  }

  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<AtualizarPrecosResponse>(json);
  if (!retorno) throw new Error("Resposta inválida da Olist/Tiny.");
  if ((retorno.registros ?? []).length > 0) return retorno;
  if (!isTinyRetornoOk(retorno)) throw new Error(readTinyErrors(retorno));
  return retorno;
}

const PRECO_BATCH_SIZE = 20;

/** Atualiza preços em lotes e valida cada registro retornado pela Olist. */
export async function atualizarPrecosOlistEmBatches(
  apiToken: string,
  items: OlistPrecoUpdateInput[],
  batchSize = PRECO_BATCH_SIZE,
): Promise<{ ok: number; falhas: Array<{ sku: string; erro: string }> }> {
  let ok = 0;
  const falhas: Array<{ sku: string; erro: string }> = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const res = await atualizarPrecosOlistLote(
        apiToken,
        batch.map((p) => ({ id: p.id, preco: p.preco })),
      );
      const parsed = countAtualizarPrecosOk(batch, res.registros);
      ok += parsed.ok;
      falhas.push(...parsed.falhas);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao atualizar preços na Olist.";
      for (const p of batch) falhas.push({ sku: p.sku ?? String(p.id), erro: msg });
    }
  }

  return { ok, falhas };
}

/** Atualiza produtos em lote (ex.: preço de custo) via produto.alterar.php. */
export async function alterarProdutosOlistLote(
  apiToken: string,
  produtos: OlistAlterarProdutoPayload[],
): Promise<AlterarProdutosResponse> {
  const token = apiToken.trim();
  if (!token) {
    throw new Error("Informe o token API da Olist/Tiny.");
  }
  if (produtos.length === 0) {
    return { status: "OK", status_processamento: 3, registros: [] };
  }

  const payload = {
    produtos: produtos.map((p) => {
      const produto: Record<string, unknown> = {
        sequencia: p.sequencia,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        preco: p.preco,
        preco_custo: p.preco_custo,
        origem: p.origem,
        situacao: p.situacao,
        tipo: p.tipo,
      };
      if (p.id != null && p.id > 0) produto.id = p.id;
      if (p.variacoes?.length) produto.variacoes = p.variacoes;
      if (p.imagens_externas?.length) {
        produto.imagens_externas = p.imagens_externas.map((url) => ({
          imagem_externa: { url },
        }));
      }
      return { produto };
    }),
  };

  const body = new URLSearchParams({
    token,
    formato: "JSON",
    produto: JSON.stringify(payload),
  });

  const res = await fetch(`${TINY_API2_BASE}/produto.alterar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`A Olist/Tiny respondeu com HTTP ${res.status} em produto.alterar.php.`);
  }

  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<AlterarProdutosResponse>(json);
  if (!retorno) {
    throw new Error("Resposta inválida da Olist/Tiny.");
  }

  if ((retorno.registros ?? []).length > 0) {
    return retorno;
  }

  if (!isTinyRetornoOk(retorno)) {
    throw new Error(readTinyErrors(retorno));
  }

  return retorno;
}

export { formatTinyApiDateTime };

export type OlistAccountInfo = {
  razao_social: string | null;
  fantasia: string | null;
  cnpj_cpf: string | null;
};

type OlistInfoConta = {
  razao_social?: string;
  fantasia?: string;
  cnpj_cpf?: string;
  cnpj?: string;
  cpf?: string;
};

type OlistInfoRetorno = TinyRetornoBase & {
  conta?: OlistInfoConta;
};

function pickCnpjCpfFromConta(conta: OlistInfoConta | Record<string, unknown> | undefined): string | null {
  if (!conta || typeof conta !== "object") return null;
  const c = conta as Record<string, unknown>;
  for (const k of ["cnpj_cpf", "cnpj", "cpf", "CNPJ_CPF", "CNPJ", "CPF"]) {
    const v = c[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function fetchOlistAccountInfo(apiToken: string): Promise<OlistAccountInfo> {
  const token = apiToken.trim();
  if (!token) {
    throw new Error("Informe o token API da Olist/Tiny.");
  }

  const body = new URLSearchParams({
    token,
    formato: "JSON",
  });

  const res = await fetch(OLIST_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`A Olist/Tiny respondeu com HTTP ${res.status}.`);
  }

  const json = await readTinyHttpJson(res);
  const retorno = unwrapTinyRetorno<OlistInfoRetorno>(json);
  if (!isTinyRetornoOk(retorno)) {
    const msg =
      retorno?.erros?.map((e) => e.erro).filter(Boolean).join(" ") ||
      readTinyErrors(retorno) ||
      "Token API inválido ou sem permissão na Olist/Tiny.";
    throw new Error(msg.trim());
  }

  const conta = retorno?.conta ?? {};
  return {
    razao_social: conta.razao_social?.trim() || null,
    fantasia: conta.fantasia?.trim() || null,
    cnpj_cpf: pickCnpjCpfFromConta(conta),
  };
}

export function formatOlistAccountLabel(info: OlistAccountInfo): string | null {
  const label = info.fantasia || info.razao_social;
  return label?.trim() || null;
}
