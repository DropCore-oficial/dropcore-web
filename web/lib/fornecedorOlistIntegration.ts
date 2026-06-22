import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret } from "@/lib/sellerErpSecretBox";

export type FornecedorOlistEstoqueSyncSummary = {
  total: number;
  updated: number;
  unchanged: number;
  missing_olist: number;
  errors: number;
  pushed_sellers?: number;
};

export async function getFornecedorOlistApiToken(fornecedorId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();

  if (error || !data?.olist_token_ciphertext) return null;

  try {
    return decryptSellerErpSecret(data.olist_token_ciphertext);
  } catch {
    return null;
  }
}

export async function saveFornecedorOlistEstoqueSyncResult(
  fornecedorId: string,
  result: {
    status: "ok" | "parcial" | "erro";
    error?: string | null;
    summary: FornecedorOlistEstoqueSyncSummary;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .update({
      olist_last_estoque_sync_at: now,
      olist_last_estoque_sync_status: result.status,
      olist_last_estoque_sync_error: result.error?.trim() || null,
      olist_last_estoque_sync_summary: result.summary,
      updated_at: now,
    })
    .eq("fornecedor_id", fornecedorId);
}
