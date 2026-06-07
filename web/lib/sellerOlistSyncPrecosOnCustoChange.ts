import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { paiKeyFromSku } from "@/lib/sellerCatalogOlistExport";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { syncOlistPrecosCatalogoSeller } from "@/lib/sellerOlistSyncPrecosCatalogo";

/** Após custo aprovado no catálogo, empurra preços para a Olist de sellers ligados ao armazém. */
export async function syncOlistPrecosFornecedorGrupo(opts: {
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
    console.error("[syncOlistPrecosFornecedorGrupo] sellers:", error.message);
    return { sellers: 0, ok: 0 };
  }

  let okTotal = 0;
  let synced = 0;

  for (const row of sellers ?? []) {
    const sellerId = String((row as { id: string }).id);
    const apiToken = await getSellerOlistApiToken(sellerId);
    if (!apiToken) continue;

    try {
      const result = await syncOlistPrecosCatalogoSeller({
        apiToken,
        orgId: opts.orgId,
        sellerId,
        fornecedorId: opts.fornecedorId,
        supabase: supabaseAdmin,
        grupoKeys: [grupoKey],
      });
      synced += 1;
      okTotal += result.ok;
    } catch (e: unknown) {
      console.error("[syncOlistPrecosFornecedorGrupo]", sellerId, grupoKey, e);
    }
  }

  return { sellers: synced, ok: okTotal };
}

export function grupoKeyFromSkuString(sku: string): string {
  return paiKeyFromSku(sku.trim());
}
