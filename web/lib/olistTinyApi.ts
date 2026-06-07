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
};

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

export async function pesquisarPedidosOlist(
  apiToken: string,
  params: { dataAtualizacao: Date; pagina?: number }
): Promise<{ pedidos: OlistPedidoResumo[]; pagina: number; numero_paginas: number }> {
  const token = apiToken.trim();
  if (!token) {
    throw new Error("Informe o token API da Olist/Tiny.");
  }

  const body = new URLSearchParams({
    token,
    formato: "JSON",
    dataAtualizacao: formatTinyApiDateTime(params.dataAtualizacao),
    pagina: String(Math.max(1, params.pagina ?? 1)),
  });

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

export async function obterPedidoOlist(apiToken: string, pedidoId: number): Promise<OlistPedidoDetalhe> {
  const json = await postTinyApi2Form<ObterPedidoResponse>("pedido.obter.php", apiToken, {
    id: String(pedidoId),
  });

  const pedido = json.pedido;
  if (!pedido || typeof pedido.id !== "number") {
    throw new Error("Pedido não encontrado na Olist/Tiny.");
  }

  const itens =
    pedido.itens
      ?.map((row) => row.item)
      .filter((item): item is NonNullable<typeof item> => !!item)
      .map((item) => ({
        id_produto: typeof item.id_produto === "number" ? item.id_produto : null,
        codigo: item.codigo?.trim() || null,
        descricao: item.descricao?.trim() || null,
        quantidade: Math.max(1, Math.floor(toTinyDecimal(item.quantidade))),
      }))
      .filter((item) => item.codigo) ?? [];

  return {
    id: pedido.id,
    numero: typeof pedido.numero === "number" ? pedido.numero : null,
    numero_ecommerce: pedido.numero_ecommerce?.trim() || null,
    situacao: pedido.situacao?.trim() || null,
    codigo_rastreamento: pedido.codigo_rastreamento?.trim() || null,
    data_pedido: pedido.data_pedido?.trim() || null,
    forma_envio: pedido.forma_envio?.trim() || null,
    itens,
  };
}

export async function lancarSaidaEstoqueOlistProduto(
  apiToken: string,
  params: { idProduto: number; quantidade: number; observacoes?: string | null }
): Promise<{ saldoEstoque: number | null }> {
  const quantidade = Math.max(0, params.quantidade);
  if (quantidade <= 0) {
    return { saldoEstoque: null };
  }

  const estoquePayload = {
    estoque: {
      idProduto: params.idProduto,
      tipo: "S",
      quantidade: String(quantidade),
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

type PesquisaProdutosResponse = TinyRetornoBase & {
  pagina?: number;
  numero_paginas?: number;
  produtos?: Array<{ produto?: { id?: number; codigo?: string } }>;
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

/** Resolve id do produto na Olist pelo código (SKU), quando o pedido não traz id_produto no item. */
export async function resolverIdProdutoOlistPorCodigo(apiToken: string, codigo: string): Promise<number | null> {
  const c = codigo.trim();
  if (!c) return null;
  try {
    const retorno = await postTinyApi2Form<PesquisaProdutosResponse>("produtos.pesquisa.php", apiToken, {
      pesquisa: c,
      pagina: "1",
      situacao: "A",
    });
    const rows = retorno.produtos ?? [];
    const upper = c.toUpperCase();
    for (const row of rows) {
      const p = row?.produto;
      if (!p || typeof p.id !== "number") continue;
      if (String(p.codigo ?? "").trim().toUpperCase() === upper) {
        return p.id;
      }
    }
    if (rows.length === 1 && rows[0]?.produto && typeof rows[0].produto.id === "number") {
      return rows[0].produto.id;
    }
  } catch {
    return null;
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
    variacoes?: Array<{
      variacao?: {
        id?: number;
        codigo?: string;
        preco?: string | number;
        grade?: Record<string, string> | Array<{ chave?: string; valor?: string }>;
      };
    }>;
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

type AtualizarPrecosResponse = TinyRetornoBase & {
  registros?: Array<{
    registro?: {
      sequencia?: number;
      status?: string;
      id?: number;
      erros?: Array<{ erro?: string; campo?: string }>;
    };
  }>;
};

/** Atualiza preço de venda por id de produto/variação (produto.atualizar.precos.php). */
export async function atualizarPrecosOlistLote(
  apiToken: string,
  precos: Array<{ id: number; preco: string }>,
): Promise<AtualizarPrecosResponse> {
  const token = apiToken.trim();
  if (!token) throw new Error("Informe o token API da Olist/Tiny.");
  if (precos.length === 0) return { status: "OK", status_processamento: 3, registros: [] };

  const payload = {
    precos: precos.map((p, idx) => ({
      sequencia: idx + 1,
      id: p.id,
      preco: p.preco,
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
