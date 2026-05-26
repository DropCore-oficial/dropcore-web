import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Último POST recebido em /api/webhooks/olist para este seller (auditoria). */
export async function fetchSellerOlistWebhookLastAt(sellerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("olist_webhook_logs")
    .select("created_at")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (error.code === "42P01" || msg.includes("olist_webhook_logs") || msg.includes("does not exist")) {
      return null;
    }
    console.warn("[sellerOlistWebhookStatus]", error.message);
    return null;
  }

  return data?.created_at ?? null;
}
