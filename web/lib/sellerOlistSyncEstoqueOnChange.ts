import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { syncOlistEstoqueGrupoSeller, syncOlistEstoqueSkusSeller } from "@/lib/sellerOlistSyncEstoque";
import { grupoKeyFromSkuString } from "@/lib/sellerOlistSyncPrecosOnCustoChange";

/** Dispara sync de estoque na Olist em background (não bloqueia pedido/upload). */
export function dispararSyncEstoqueOlistFornecedorSkus(opts: {
  orgId: string;
  fornecedorId: string;
  skuCodes: string[];
}): void {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return;

  void syncOlistEstoqueFornecedorSkus({
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    skuCodes,
  }).catch((e: unknown) => {
    console.error("[dispararSyncEstoqueOlistFornecedorSkus]", skuCodes.join(","), e);
  });
}

export function dispararSyncEstoqueOlistFornecedorGrupo(opts: {
  orgId: string;
  fornecedorId: string;
  grupoKey: string;
}): void {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return;

  void syncOlistEstoqueFornecedorGrupo({
    orgId: opts.orgId,
    fornecedorId: opts.fornecedorId,
    grupoKey,
  }).catch((e: unknown) => {
    console.error("[dispararSyncEstoqueOlistFornecedorGrupo]", grupoKey, e);
  });
}

/** Após venda ou reposição — empurra saldo DropCore para a Olist de todos os sellers do armazém. */
export async function syncOlistEstoqueFornecedorSkus(opts: {
  orgId: string;
  fornecedorId: string;
  skuCodes: string[];
}): Promise<{ sellers: number; ok: number }> {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return { sellers: 0, ok: 0 };

  const { data: sellers, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (error) {
    console.error("[syncOlistEstoqueFornecedorSkus] sellers:", error.message);
    return { sellers: 0, ok: 0 };
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

  return { sellers: synced, ok: okTotal };
}

export async function syncOlistEstoqueFornecedorGrupo(opts: {
  orgId: string;
  fornecedorId: string;
  grupoKey: string;
}): Promise<{ sellers: number; ok: number }> {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return { sellers: 0, ok: 0 };

  const { data: sellers, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId);

  if (error) {
    console.error("[syncOlistEstoqueFornecedorGrupo] sellers:", error.message);
    return { sellers: 0, ok: 0 };
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

  return { sellers: synced, ok: okTotal };
}

export { grupoKeyFromSkuString };
