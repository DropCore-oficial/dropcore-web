import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptSellerErpSecret } from "@/lib/sellerErpSecretBox";

export async function getSellerOlistApiToken(sellerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error || !data?.olist_token_ciphertext) return null;

  try {
    return decryptSellerErpSecret(data.olist_token_ciphertext);
  } catch {
    return null;
  }
}
