import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeImagensForOlistExport } from "@/lib/fornecedorImagemPublicaOlist";
import { loadCatalogSkusForOlistExport } from "@/lib/sellerCatalogOlistLoad";
import {
  collectFotosProdutoOlist,
  fotosExportOlistSku,
  normalizeOrigemOlist,
  paiKeyFromSku,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import {
  alterarProdutosOlistLote,
  codigoOlistMatchesSku,
  obterProdutoOlistPorId,
  parseTinyPreco,
  resolverIdProdutoOlistPorCodigo,
  type OlistAlterarProdutoPayload,
  type OlistProdutoOlistDetalhe,
} from "@/lib/olistTinyApi";
import { filtrarFalhasSyncOlist } from "@/lib/sellerOlistSyncCustos";

const BATCH_SIZE = 8;
const BATCH_PAUSE_MS = 450;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function formatTinyDecimal(value: number): string {
  const n = Math.round(value * 100) / 100;
  return n.toFixed(2);
}

function isSkuPaiInterno(sku: string): boolean {
  const s = str(sku).toUpperCase();
  return s.length >= 3 && s.endsWith("000");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countAlterOk(
  payload: OlistAlterarProdutoPayload[],
  registros: Array<{ registro?: { sequencia?: number; status?: string; erros?: Array<{ erro?: string }> } }> | undefined,
): { ok: number; falhas: Array<{ sku: string; erro: string }> } {
  const seqToSku = new Map(payload.map((p) => [p.sequencia, p.codigo]));
  const falhas: Array<{ sku: string; erro: string }> = [];
  let ok = 0;
  if (!registros?.length) {
    return { ok: 0, falhas: payload.map((p) => ({ sku: p.codigo, erro: "Olist não confirmou alteração de imagem." })) };
  }
  for (const row of registros) {
    const reg = row.registro;
    if (!reg) continue;
    const sku = seqToSku.get(Number(reg.sequencia)) ?? `#${reg.sequencia ?? "?"}`;
    if (String(reg.status ?? "").toUpperCase() === "OK") {
      ok += 1;
    } else {
      const msg = reg.erros?.map((e) => e.erro).filter(Boolean).join(" ") || "Erro ao atualizar imagem na Olist.";
      falhas.push({ sku, erro: msg.trim() });
    }
  }
  return { ok, falhas };
}

function alterPayloadFromOlistProduto(
  prod: OlistProdutoOlistDetalhe,
  codigo: string,
  sequencia: number,
  urls: string[],
): OlistAlterarProdutoPayload {
  const precoLista = parseTinyPreco(prod.preco) ?? 0;
  const precoCusto = parseTinyPreco(prod.preco_custo) ?? 0;
  return {
    sequencia,
    id: typeof prod.id === "number" ? prod.id : undefined,
    codigo: codigo.toUpperCase(),
    nome: str(prod.nome).slice(0, 120) || codigo,
    unidade: str(prod.unidade) || "UN",
    preco: formatTinyDecimal(precoLista),
    preco_custo: formatTinyDecimal(precoCusto),
    origem: normalizeOrigemOlist(str(prod.origem)),
    situacao: str(prod.situacao).toUpperCase() === "I" ? "I" : "A",
    tipo: "P",
    imagens_externas: urls.slice(0, 10),
  };
}

/** SKUs com foto exportável + capa do pai — alinhado à planilha Olist. */
export function listarSkusComFotosGrupo(
  items: CatalogSkuForOlistExport[],
  paiKey: string,
): Array<{ codigo: string; urls: string[] }> {
  const pai = items.find((i) => str(i.sku).toUpperCase() === paiKey) ?? null;
  const filhos = items.filter((i) => !isSkuPaiInterno(str(i.sku)));
  const out: Array<{ codigo: string; urls: string[] }> = [];

  const fotosPai = collectFotosProdutoOlist(pai, filhos);
  if (fotosPai.length > 0) {
    out.push({ codigo: paiKey, urls: fotosPai });
  }

  for (const filho of filhos) {
    const codigo = str(filho.sku).toUpperCase();
    if (!codigo) continue;
    const urls = fotosExportOlistSku(filho);
    if (urls.length === 0) continue;
    out.push({ codigo, urls });
  }

  return out;
}

async function buildAlterImagemPayload(
  apiToken: string,
  codigo: string,
  urls: string[],
  sequencia: number,
): Promise<OlistAlterarProdutoPayload | null> {
  const id = await resolverIdProdutoOlistPorCodigo(apiToken, codigo);
  if (!id) return null;
  const prod = await obterProdutoOlistPorId(apiToken, id);
  if (!prod || !codigoOlistMatchesSku(prod.codigo, codigo)) return null;
  return alterPayloadFromOlistProduto(prod, codigo, sequencia, urls);
}

export type SyncOlistImagensResult = {
  total: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string }>;
  ignorados_sem_foto: number;
  ignorados_ausente_olist: number;
};

/** Empurra fotos do grupo para produtos já cadastrados na Olist (evento — não usar em cron/F5). */
export async function syncOlistImagensGrupo(
  apiToken: string,
  items: CatalogSkuForOlistExport[],
): Promise<SyncOlistImagensResult> {
  const skuSample = items.map((i) => str(i.sku)).find(Boolean) ?? "";
  const paiKey = paiKeyFromSku(skuSample);
  const alvos = listarSkusComFotosGrupo(items, paiKey);

  const result: SyncOlistImagensResult = {
    total: alvos.length,
    ok: 0,
    falhas: [],
    ignorados_sem_foto: items.length === 0 ? 0 : 0,
    ignorados_ausente_olist: 0,
  };

  if (alvos.length === 0) {
    result.ignorados_sem_foto = 1;
    return result;
  }

  const payloads: OlistAlterarProdutoPayload[] = [];
  let seq = 0;
  for (const alvo of alvos) {
    seq += 1;
    const payload = await buildAlterImagemPayload(apiToken, alvo.codigo, alvo.urls, seq);
    if (!payload) {
      result.ignorados_ausente_olist += 1;
      continue;
    }
    payloads.push(payload);
  }

  if (payloads.length === 0) {
    return result;
  }

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    try {
      const res = await alterarProdutosOlistLote(apiToken, batch);
      const parsed = countAlterOk(batch, res.registros);
      result.ok += parsed.ok;
      result.falhas.push(...parsed.falhas);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao sincronizar imagens na Olist.";
      for (const p of batch) result.falhas.push({ sku: p.codigo, erro: msg });
    }
    if (i + BATCH_SIZE < payloads.length) await sleep(BATCH_PAUSE_MS);
  }

  result.falhas = filtrarFalhasSyncOlist(result.ok, result.falhas);
  return result;
}

export type SyncOlistImagensCatalogoResult = {
  grupos: number;
  grupos_ok: number;
  ok: number;
  falhas: Array<{ sku: string; erro: string; grupo?: string }>;
};

export async function syncOlistImagensCatalogoSeller(opts: {
  apiToken: string;
  orgId: string;
  sellerId: string;
  fornecedorId: string;
  supabase: SupabaseClient;
  grupoKeys: string[];
}): Promise<SyncOlistImagensCatalogoResult> {
  const result: SyncOlistImagensCatalogoResult = {
    grupos: opts.grupoKeys.length,
    grupos_ok: 0,
    ok: 0,
    falhas: [],
  };

  for (const grupoKey of opts.grupoKeys) {
    const loaded = await loadCatalogSkusForOlistExport({
      orgId: opts.orgId,
      sellerId: opts.sellerId,
      fornecedorId: opts.fornecedorId,
      grupoKey,
      scope: "todos",
      supabase: opts.supabase,
    });

    if (!loaded.ok) {
      result.falhas.push({ sku: grupoKey, erro: loaded.error, grupo: grupoKey });
      continue;
    }

    const withPublicImagens = await normalizeImagensForOlistExport(loaded.items, {
      supabase: opts.supabase,
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
    });

    const sync = await syncOlistImagensGrupo(opts.apiToken, withPublicImagens);
    result.ok += sync.ok;
    result.falhas.push(...sync.falhas.map((f) => ({ ...f, grupo: grupoKey })));
    if (sync.ok > 0) result.grupos_ok += 1;
  }

  result.falhas = filtrarFalhasSyncOlist(result.ok, result.falhas);
  return result;
}
