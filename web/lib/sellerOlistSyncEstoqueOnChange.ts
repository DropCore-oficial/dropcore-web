import { getFornecedorOlistApiToken } from "@/lib/fornecedorOlistIntegration";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import type { CatalogSkuForOlistExport } from "@/lib/sellerCatalogOlistExport";
import {
  estoqueDisponivelParaVenda,
  skusParaSyncEstoqueOlistComPaiSoma,
  syncOlistEstoqueGrupoSeller,
  syncOlistEstoqueSkusSeller,
} from "@/lib/sellerOlistSyncEstoque";
import { grupoKeyFromSkuString } from "@/lib/sellerOlistSyncPrecosOnCustoChange";

export type SyncOlistEstoqueOutboundOpts = {
  orgId: string;
  fornecedorId: string;
  /** Quando true, não empurra de volta para a Olist do armazém (mudança veio do webhook/cron do fornecedor). */
  skipFornecedorPush?: boolean;
};

/** Dispara sync de estoque na Olist em background (não bloqueia pedido/upload). */
export function dispararSyncEstoqueOlistFornecedorSkus(
  opts: SyncOlistEstoqueOutboundOpts & { skuCodes: string[] },
): void {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return;

  void syncOlistEstoqueFornecedorSkus({
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    skuCodes,
    skipFornecedorPush: opts.skipFornecedorPush,
  }).catch((e: unknown) => {
    console.error("[dispararSyncEstoqueOlistFornecedorSkus]", skuCodes.join(","), e);
  });
}

export function dispararSyncEstoqueOlistFornecedorGrupo(
  opts: SyncOlistEstoqueOutboundOpts & { grupoKey: string },
): void {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return;

  void syncOlistEstoqueFornecedorGrupo({
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    grupoKey,
    skipFornecedorPush: opts.skipFornecedorPush,
  }).catch((e: unknown) => {
    console.error("[dispararSyncEstoqueOlistFornecedorGrupo]", grupoKey, e);
  });
}

async function pushEstoqueToFornecedorOlist(opts: {
  orgId: string;
  fornecedorId: string;
  skuCodes: string[];
  saldoOverrides?: Map<string, number>;
}): Promise<number> {
  const apiToken = await getFornecedorOlistApiToken(opts.fornecedorId);
  if (!apiToken) return 0;

  try {
    const result = await syncOlistEstoqueSkusSeller({
      apiToken,
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      supabase: supabaseAdmin,
      skuCodes: opts.skuCodes,
      saldoOverrides: opts.saldoOverrides,
    });
    return result.ok;
  } catch (e: unknown) {
    console.error("[pushEstoqueToFornecedorOlist]", opts.fornecedorId, e);
    return 0;
  }
}

async function loadSkusGrupoFornecedorForOlistSync(opts: {
  orgId: string;
  fornecedorId: string;
  grupoKey: string;
}): Promise<{ skuCodes: string[]; saldoOverrides: Map<string, number> } | null> {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  const prefix = grupoKey.length >= 3 ? grupoKey.slice(0, -3) : grupoKey;

  const { data: rows, error } = await supabaseAdmin
    .from("skus")
    .select("sku, estoque_atual, estoque_reservado")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .like("sku", `${prefix}%`);

  if (error || !rows?.length) return null;

  const items: CatalogSkuForOlistExport[] = rows.map((row) => {
    const atual = (row as { estoque_atual?: number | null }).estoque_atual;
    const disponivel =
      atual == null ? null : estoqueDisponivelParaVenda(atual, (row as { estoque_reservado?: number | null }).estoque_reservado);
    return {
    id: "",
    sku: String((row as { sku?: string }).sku ?? ""),
    nome_produto: "",
    cor: "",
    tamanho: "",
    status: "ativo",
    categoria: null,
    estoque_atual: disponivel,
    custo_total: null,
    imagem_url: null,
    link_fotos: null,
    descricao: null,
    ncm: null,
    origem: null,
    marca: null,
    cest: null,
    peso_kg: null,
    peso_liquido_kg: null,
    peso_bruto_kg: null,
    comprimento_cm: null,
    largura_cm: null,
    altura_cm: null,
    habilitado_venda: false,
    };
  });

  return skusParaSyncEstoqueOlistComPaiSoma(items, grupoKey);
}

/** Após venda ou reposição — empurra saldo DropCore para Olist do armazém e de todos os sellers. */
export async function syncOlistEstoqueFornecedorSkus(
  opts: SyncOlistEstoqueOutboundOpts & { skuCodes: string[] },
): Promise<{ sellers: number; ok: number; fornecedorOk: number }> {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return { sellers: 0, ok: 0, fornecedorOk: 0 };

  let fornecedorOk = 0;
  if (!opts.skipFornecedorPush) {
    fornecedorOk = await pushEstoqueToFornecedorOlist({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      skuCodes,
    });
  }

  const { data: sellers, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (error) {
    console.error("[syncOlistEstoqueFornecedorSkus] sellers:", error.message);
    return { sellers: 0, ok: 0, fornecedorOk };
  }

  let okTotal = 0;
  let synced = 0;

  for (const row of sellers ?? []) {
    const sellerId = String((row as { id: string }).id);
    const apiToken = await getSellerOlistApiToken(sellerId);
    if (!apiToken) continue;

    try {
      const result = await syncOlistEstoqueSkusSeller({
        apiToken,
        orgId: opts.orgId,
        fornecedorId: opts.fornecedorId,
        supabase: supabaseAdmin,
        skuCodes,
      });
      synced += 1;
      okTotal += result.ok;
    } catch (e: unknown) {
      console.error("[syncOlistEstoqueFornecedorSkus]", sellerId, e);
    }
  }

  return { sellers: synced, ok: okTotal, fornecedorOk };
}

export async function syncOlistEstoqueFornecedorGrupo(
  opts: SyncOlistEstoqueOutboundOpts & { grupoKey: string },
): Promise<{ sellers: number; ok: number; fornecedorOk: number }> {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return { sellers: 0, ok: 0, fornecedorOk: 0 };

  let fornecedorOk = 0;
  if (!opts.skipFornecedorPush) {
    const loaded = await loadSkusGrupoFornecedorForOlistSync({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      grupoKey,
    });
    if (loaded?.skuCodes.length) {
      fornecedorOk = await pushEstoqueToFornecedorOlist({
        orgId: opts.orgId,
        fornecedorId: opts.fornecedorId,
        skuCodes: loaded.skuCodes,
        saldoOverrides: loaded.saldoOverrides,
      });
    }
  }

  const { data: sellers, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (error) {
    console.error("[syncOlistEstoqueFornecedorGrupo] sellers:", error.message);
    return { sellers: 0, ok: 0, fornecedorOk };
  }

  let okTotal = 0;
  let synced = 0;

  for (const row of sellers ?? []) {
    const sellerId = String((row as { id: string }).id);
    const apiToken = await getSellerOlistApiToken(sellerId);
    if (!apiToken) continue;

    try {
      const result = await syncOlistEstoqueGrupoSeller({
        apiToken,
        orgId: opts.orgId,
        sellerId,
        fornecedorId: opts.fornecedorId,
        supabase: supabaseAdmin,
        grupoKey,
      });
      synced += 1;
      okTotal += result.ok;
    } catch (e: unknown) {
      console.error("[syncOlistEstoqueFornecedorGrupo]", sellerId, grupoKey, e);
    }
  }

  return { sellers: synced, ok: okTotal, fornecedorOk };
}

export { grupoKeyFromSkuString };
