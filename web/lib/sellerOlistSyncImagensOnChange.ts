import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { syncOlistImagensCatalogoSeller } from "@/lib/sellerOlistSyncImagens";
import { grupoKeyFromSkuString } from "@/lib/sellerOlistSyncPrecosOnCustoChange";

/** Após foto aprovada ou upload do fornecedor, empurra imagens para sellers com Olist ligada. */
export async function syncOlistImagensFornecedorGrupo(opts: {
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
    console.error("[syncOlistImagensFornecedorGrupo] sellers:", error.message);
    return { sellers: 0, ok: 0 };
  }

  let okTotal = 0;
  let synced = 0;

  for (const row of sellers ?? []) {
    const sellerId = String((row as { id: string }).id);
    const apiToken = await getSellerOlistApiToken(sellerId);
    if (!apiToken) continue;

    try {
      const result = await syncOlistImagensCatalogoSeller({
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
      console.error("[syncOlistImagensFornecedorGrupo]", sellerId, grupoKey, e);
    }
  }

  return { sellers: synced, ok: okTotal };
}

export { grupoKeyFromSkuString };
