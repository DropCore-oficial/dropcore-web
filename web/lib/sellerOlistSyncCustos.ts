import {
  normalizeOrigemOlist,
  paiKeyFromSku,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import {
  alterarProdutosOlistLote,
  atualizarPrecosOlistEmBatches,
  menorPrecoVariacoesOlist,
  obterProdutoOlistPorId,
  parseTinyPreco,
  resolverIdProdutoOlistPorCodigo,
  type OlistAlterarProdutoPayload,
  type OlistPrecoUpdateInput,
} from "@/lib/olistTinyApi";

const BATCH_SIZE = 12;
const BATCH_PAUSE_MS = 400;
const VARIACOES_POR_ALTER = 40;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function formatTinyDecimal(value: number): string {
  const n = Math.round(value * 100) / 100;
  return n.toFixed(2);
}

function resolveCustoUnit(item: CatalogSkuForOlistExport, fallbackCusto?: number | null): number | null {
  const c = item.custo_total;
  if (c != null && Number.isFinite(c) && c > 0) return c;
  if (fallbackCusto != null && Number.isFinite(fallbackCusto) && fallbackCusto > 0) return fallbackCusto;
  return null;
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

function custoGrupoMax(items: CatalogSkuForOlistExport[]): number | null {
  const filhos = items.filter((i) => !isSkuPaiInterno(str(i.sku)));
  const pool = filhos.length > 0 ? filhos : items;
  let acc: number | null = null;
  for (const item of pool) {
    const c = resolveCustoUnit(item);
    if (c == null) continue;
    acc = acc == null ? c : Math.max(acc, c);
  }
  return acc;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function custoPorSkuMap(items: CatalogSkuForOlistExport[], custoGrupo: number | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (isSkuPaiInterno(str(item.sku))) continue;
    const sku = str(item.sku).toUpperCase();
    if (!sku) continue;
    const custo = resolveCustoUnit(item, custoGrupo);
    if (custo != null) map.set(sku, custo);
  }
  return map;
}

async function verificarPrecoListaOlist(
  apiToken: string,
  parentId: number,
  paiKey: string,
  precoEsperado: string,
): Promise<{ sku: string; erro: string } | null> {
  const depois = await obterProdutoOlistPorId(apiToken, parentId);
  if (!depois) {
    return { sku: paiKey, erro: "Não foi possível reler o produto na Olist após o sync de preço." };
  }
  const esperado = parseTinyPreco(precoEsperado);
  if (esperado == null) return null;
  const minVar = menorPrecoVariacoesOlist(depois);
  const precoPai = parseTinyPreco(depois.preco);
  const precoLista = minVar ?? precoPai;
  if (precoLista == null || Math.abs(precoLista - esperado) >= 0.02) {
    const visto = precoLista != null ? precoLista.toFixed(2).replace(".", ",") : "—";
    const alvo = precoEsperado.replace(".", ",");
    return {
      sku: paiKey,
      erro: `Preço na lista da Olist ainda ${visto} (esperado ${alvo}). Recarregue a Olist ou tente de novo em instantes.`,
    };
  }
  return null;
}

function buildAlterPayload(
  batch: CatalogSkuForOlistExport[],
  custoGrupo: number | null,
  margemPct: number,
  sequenciaInicial: number,
): OlistAlterarProdutoPayload[] {
  const mult = 1 + Math.max(0, margemPct) / 100;
  const out: OlistAlterarProdutoPayload[] = [];
  let seq = sequenciaInicial;
  for (const item of batch) {
    const custo = resolveCustoUnit(item, custoGrupo);
    if (custo == null) continue;
    const sku = str(item.sku);
    if (!sku) continue;
    seq += 1;
    const nome = str(item.nome_produto) || sku;
    out.push({
      sequencia: seq,
      codigo: sku,
      nome: nome.slice(0, 120),
      unidade: "UN",
      preco: formatTinyDecimal(custo * mult),
      preco_custo: formatTinyDecimal(custo),
      origem: normalizeOrigemOlist(item.origem),
      situacao: str(item.status).toLowerCase() === "ativo" ? "A" : "I",
      tipo: "P",
    });
  }
  return out;
}

function countAlterOk(
  payload: OlistAlterarProdutoPayload[],
  registros: Array<{ registro?: { sequencia?: number; status?: string; erros?: Array<{ erro?: string }> } }> | undefined,
): { ok: number; falhas: Array<{ sku: string; erro: string }> } {
  const seqToSku = new Map(payload.map((p) => [p.sequencia, p.codigo]));
  const falhas: Array<{ sku: string; erro: string }> = [];
  let ok = 0;
  if (!registros?.length) {
    return { ok: 0, falhas: payload.map((p) => ({ sku: p.codigo, erro: "Olist não confirmou alteração do produto." })) };
  }
  for (const row of registros) {
    const reg = row.registro;
    if (!reg) continue;
    const sku = seqToSku.get(Number(reg.sequencia)) ?? `#${reg.sequencia ?? "?"}`;
    if (String(reg.status ?? "").toUpperCase() === "OK") {
      ok += 1;
    } else {
      const msg = reg.erros?.map((e) => e.erro).filter(Boolean).join(" ") || "Erro ao atualizar na Olist.";
      falhas.push({ sku, erro: msg.trim() });
    }
  }
  return { ok, falhas };
}

export type SyncOlistCustosResult = {
  total: number;
  com_custo: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string }>;
  ignorados_sem_custo: number;
  modo?: "variacoes_pai" | "sku_individual";
  pai_id?: number;
};

/** Produto pai + variações na Olist (tipoVariacao P) — preço/custo vão nas variações, não no SKU avulso. */
async function syncOlistGrupoVariacoesPai(
  apiToken: string,
  items: CatalogSkuForOlistExport[],
  opts: { margemPct: number; paiKey: string; custoGrupo: number },
): Promise<SyncOlistCustosResult | null> {
  const paiKey = opts.paiKey;
  const parentId = await resolverIdProdutoOlistPorCodigo(apiToken, paiKey);
  if (!parentId) return null;

  const produto = await obterProdutoOlistPorId(apiToken, parentId);
  const variacoesOlist = produto?.variacoes ?? [];
  if (!produto || String(produto.tipoVariacao ?? "").toUpperCase() !== "P" || variacoesOlist.length === 0) {
    return null;
  }

  const custoMap = custoPorSkuMap(items, opts.custoGrupo);
  const mult = 1 + Math.max(0, opts.margemPct) / 100;
  const nomePai = str(produto.nome) || paiKey;
  const origem = normalizeOrigemOlist(str(produto.origem) || items[0]?.origem || null);
  const situacao = str(produto.situacao).toUpperCase() === "I" ? "I" : "A";

  const variacoesPayload: Array<{ variacao: { id?: number; codigo?: string; preco?: string } }> = [];
  const precosIds: OlistPrecoUpdateInput[] = [];
  const filhosAlter: OlistAlterarProdutoPayload[] = [];

  for (const row of variacoesOlist) {
    const v = row?.variacao;
    if (!v) continue;
    const codigo = str(v.codigo);
    const idVar = typeof v.id === "number" ? v.id : Number.parseInt(String(v.id ?? ""), 10);
    if (!codigo || !Number.isFinite(idVar) || idVar <= 0) continue;

    const custoFilho = custoMap.get(codigo.toUpperCase());
    const custo = custoFilho ?? opts.custoGrupo;
    if (custo == null || !Number.isFinite(custo) || custo <= 0) continue;

    const precoVenda = formatTinyDecimal(custo * mult);
    const precoCusto = formatTinyDecimal(custo);

    variacoesPayload.push({
      variacao: { id: idVar, codigo, preco: precoVenda },
    });
    precosIds.push({ id: idVar, preco: precoVenda, sku: codigo });
    filhosAlter.push({
      sequencia: filhosAlter.length + 1,
      id: idVar,
      codigo,
      nome: nomePai.slice(0, 120),
      unidade: str(produto.unidade) || "UN",
      preco: precoVenda,
      preco_custo: precoCusto,
      origem,
      situacao,
      tipo: "P",
    });
  }

  if (variacoesPayload.length === 0) return null;

  const precoPaiRef = formatTinyDecimal(opts.custoGrupo * mult);
  const custoPaiRef = formatTinyDecimal(opts.custoGrupo);
  const result: SyncOlistCustosResult = {
    total: variacoesPayload.length + 1,
    com_custo: variacoesPayload.length + 1,
    ok: 0,
    falhas: [],
    ignorados_sem_custo: 0,
    modo: "variacoes_pai",
    pai_id: parentId,
  };

  // 1) Preço de venda na lista da Olist — produto.atualizar.precos (fonte do que aparece em Produtos)
  const precosParaOlist = [
    { id: parentId, preco: precoPaiRef, sku: paiKey },
    ...precosIds.map((p) => ({ id: p.id, preco: p.preco, sku: p.sku })),
  ];
  const precosSync = await atualizarPrecosOlistEmBatches(apiToken, precosParaOlist);
  result.ok = precosSync.ok;
  result.falhas.push(...precosSync.falhas);

  // 2) Custo / cadastro — produto.alterar (não atualiza sozinho o preço da grade)
  try {
    const paiPayload: OlistAlterarProdutoPayload = {
      sequencia: 1,
      id: parentId,
      codigo: paiKey,
      nome: nomePai.slice(0, 120),
      unidade: str(produto.unidade) || "UN",
      preco: precoPaiRef,
      preco_custo: custoPaiRef,
      origem,
      situacao,
      tipo: "P",
      variacoes: variacoesPayload.slice(0, VARIACOES_POR_ALTER),
    };
    const resPai = await alterarProdutosOlistLote(apiToken, [paiPayload]);
    const parsedPai = countAlterOk([paiPayload], resPai.registros);
    result.falhas.push(...parsedPai.falhas.map((f) => ({ sku: paiKey, erro: f.erro })));
  } catch (e: unknown) {
    result.falhas.push({ sku: paiKey, erro: e instanceof Error ? e.message : "Erro ao atualizar pai na Olist." });
  }

  for (let i = 0; i < filhosAlter.length; i += BATCH_SIZE) {
    const batch = filhosAlter.slice(i, i + BATCH_SIZE).map((p, idx) => ({ ...p, sequencia: idx + 1 }));
    try {
      const res = await alterarProdutosOlistLote(apiToken, batch);
      const parsed = countAlterOk(batch, res.registros);
      result.falhas.push(...parsed.falhas);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro na API Olist.";
      for (const p of batch) result.falhas.push({ sku: p.codigo, erro: msg });
    }
    if (i + BATCH_SIZE < filhosAlter.length) await sleep(BATCH_PAUSE_MS);
  }

  const verificacao = await verificarPrecoListaOlist(apiToken, parentId, paiKey, precoPaiRef);
  if (verificacao) {
    result.falhas.push(verificacao);
    if (result.ok > 0) result.ok = Math.max(0, result.ok - 1);
  }

  return result;
}

async function syncOlistSkusIndividuais(
  apiToken: string,
  items: CatalogSkuForOlistExport[],
  opts: { margemPct: number },
): Promise<SyncOlistCustosResult> {
  const margemPct = opts.margemPct;
  const custoGrupo = custoGrupoMax(items);
  const comCusto = items.filter((i) => resolveCustoUnit(i, custoGrupo) != null);
  const result: SyncOlistCustosResult = {
    total: items.length,
    com_custo: comCusto.length,
    ok: 0,
    falhas: [],
    ignorados_sem_custo: items.length - comCusto.length,
    modo: "sku_individual",
  };

  if (comCusto.length === 0) return result;

  const mult = 1 + Math.max(0, margemPct) / 100;
  const precosParaOlist: OlistPrecoUpdateInput[] = [];
  for (const item of comCusto) {
    const sku = str(item.sku);
    if (!sku) continue;
    const custo = resolveCustoUnit(item, custoGrupo);
    if (custo == null) continue;
    const id = await resolverIdProdutoOlistPorCodigo(apiToken, sku);
    if (!id) {
      result.falhas.push({ sku, erro: "SKU não encontrado na Olist para atualizar preço." });
      continue;
    }
    precosParaOlist.push({ id, preco: formatTinyDecimal(custo * mult), sku });
  }

  if (precosParaOlist.length > 0) {
    const precosSync = await atualizarPrecosOlistEmBatches(apiToken, precosParaOlist);
    result.ok = precosSync.ok;
    result.falhas.push(...precosSync.falhas);
  }

  let sequencia = 0;
  for (let i = 0; i < comCusto.length; i += BATCH_SIZE) {
    const batch = comCusto.slice(i, i + BATCH_SIZE);
    const payload = buildAlterPayload(batch, custoGrupo, margemPct, sequencia);
    sequencia = payload.length > 0 ? payload[payload.length - 1]!.sequencia : sequencia;
    if (payload.length === 0) continue;

    try {
      const res = await alterarProdutosOlistLote(apiToken, payload);
      const parsed = countAlterOk(payload, res.registros);
      result.falhas.push(...parsed.falhas);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro na API Olist.";
      for (const p of payload) result.falhas.push({ sku: p.codigo, erro: msg });
    }

    if (i + BATCH_SIZE < comCusto.length) await sleep(BATCH_PAUSE_MS);
  }

  return result;
}

/** Atualiza preço de venda e custo na Olist via API (pai com variações ou SKUs avulsos). */
export async function syncOlistCustosGrupo(
  apiToken: string,
  items: CatalogSkuForOlistExport[],
  opts?: { margemPct?: number },
): Promise<SyncOlistCustosResult> {
  const margemPct = opts?.margemPct ?? 0;
  const custoGrupo = custoGrupoMax(items);
  if (custoGrupo == null) {
    return {
      total: items.length,
      com_custo: 0,
      ok: 0,
      falhas: [],
      ignorados_sem_custo: items.length,
    };
  }

  const paiKey = paiKeyFromSku(str(items[0]?.sku ?? ""));
  const viaPai = await syncOlistGrupoVariacoesPai(apiToken, items, { margemPct, paiKey, custoGrupo });
  if (viaPai) return viaPai;

  return syncOlistSkusIndividuais(apiToken, items, { margemPct });
}
