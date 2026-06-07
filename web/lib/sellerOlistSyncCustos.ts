import {
  normalizeOrigemOlist,
  paiKeyFromSku,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import { alterarProdutosOlistLote, type OlistAlterarProdutoPayload } from "@/lib/olistTinyApi";

const BATCH_SIZE = 12;
const BATCH_PAUSE_MS = 400;

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

function custoGrupoMax(items: CatalogSkuForOlistExport[]): number | null {
  let acc: number | null = null;
  for (const item of items) {
    const c = resolveCustoUnit(item);
    if (c == null) continue;
    acc = acc == null ? c : Math.max(acc, c);
  }
  return acc;
}

/** Pai + filhos — espelha o CSV (custo no pai e em cada variação). */
export function buildSkusParaSyncCustoOlist(items: CatalogSkuForOlistExport[]): CatalogSkuForOlistExport[] {
  if (items.length === 0) return [];

  const custoGrupo = custoGrupoMax(items);
  const paiKey = paiKeyFromSku(str(items[0]!.sku));
  const paiRow = items.find((i) => str(i.sku) === paiKey);
  const nomeGrupo = str(paiRow?.nome_produto) || str(items[0]!.nome_produto) || paiKey;
  const filhos = items.filter((i) => str(i.sku) !== paiKey);
  const out: CatalogSkuForOlistExport[] = [];

  if (filhos.length > 0 && paiKey) {
    out.push({
      ...(paiRow ?? items[0]!),
      sku: paiKey,
      nome_produto: nomeGrupo,
      cor: "",
      tamanho: "",
      custo_total: custoGrupo,
      estoque_atual: null,
    });
    out.push(...filhos);
    return out;
  }

  return [...items];
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
      preco: "0.00",
      preco_custo: formatTinyDecimal(custo * mult),
      origem: normalizeOrigemOlist(item.origem),
      situacao: str(item.status).toLowerCase() === "ativo" ? "A" : "I",
      tipo: "P",
    });
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SyncOlistCustosResult = {
  total: number;
  com_custo: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string }>;
  ignorados_sem_custo: number;
};

/** Atualiza preço de custo na Olist via API (pai + filhos) — complementa a planilha CSV. */
export async function syncOlistCustosGrupo(
  apiToken: string,
  items: CatalogSkuForOlistExport[],
  opts?: { margemPct?: number },
): Promise<SyncOlistCustosResult> {
  const margemPct = opts?.margemPct ?? 0;
  const skusSync = buildSkusParaSyncCustoOlist(items);
  const custoGrupo = custoGrupoMax(items);
  const comCusto = skusSync.filter((i) => resolveCustoUnit(i, custoGrupo) != null);
  const result: SyncOlistCustosResult = {
    total: skusSync.length,
    com_custo: comCusto.length,
    ok: 0,
    falhas: [],
    ignorados_sem_custo: skusSync.length - comCusto.length,
  };

  if (comCusto.length === 0) return result;

  let sequencia = 0;
  for (let i = 0; i < comCusto.length; i += BATCH_SIZE) {
    const batch = comCusto.slice(i, i + BATCH_SIZE);
    const payload = buildAlterPayload(batch, custoGrupo, margemPct, sequencia);
    sequencia = payload.length > 0 ? payload[payload.length - 1]!.sequencia : sequencia;

    if (payload.length === 0) continue;

    const seqToSku = new Map(payload.map((p) => [p.sequencia, p.codigo]));

    try {
      const res = await alterarProdutosOlistLote(apiToken, payload);
      const registros = res.registros ?? [];
      if (registros.length === 0) {
        result.ok += payload.length;
      } else {
        for (const row of registros) {
          const reg = row.registro;
          if (!reg) continue;
          const sku = seqToSku.get(Number(reg.sequencia)) ?? `#${reg.sequencia ?? "?"}`;
          if (String(reg.status ?? "").toUpperCase() === "OK") {
            result.ok += 1;
          } else {
            const msg = reg.erros?.map((e) => e.erro).filter(Boolean).join(" ") || "Erro ao atualizar custo.";
            result.falhas.push({ sku, erro: msg.trim() });
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro na API Olist.";
      for (const p of payload) {
        result.falhas.push({ sku: p.codigo, erro: msg });
      }
    }

    if (i + BATCH_SIZE < comCusto.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  return result;
}
