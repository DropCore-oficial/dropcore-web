import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Token opaco por seller na URL do webhook (`?w=`). Não depende de OLIST_WEBHOOK_SECRET. */
export function newOlistIngestToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Garante `olist_ingest_token` quando já existe CNPJ gravado (webhook pode validar binding).
 * Idempotente; seguro em concorrência (só um `UPDATE ... WHERE token IS NULL` vence).
 */
export async function ensureSellerOlistIngestToken(sellerId: string): Promise<string | null> {
  const { data: cur, error: selErr } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_ingest_token, olist_account_cnpj_normalized")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (selErr) {
    const msg = String(selErr.message ?? "").toLowerCase();
    if (msg.includes("olist_ingest_token") || selErr.code === "42703") {
      return null;
    }
    console.error("[olistIngestToken] select:", selErr.message);
    return null;
  }

  const cnpj = String(cur?.olist_account_cnpj_normalized ?? "").trim();
  if (cnpj.length < 11) return null;

  const existing = String(cur?.olist_ingest_token ?? "").trim();
  if (existing) return existing;

  for (let i = 0; i < 6; i++) {
    const token = newOlistIngestToken();
    const { data: upd, error: upErr } = await supabaseAdmin
      .from("seller_olist_integrations")
      .update({ olist_ingest_token: token, updated_at: new Date().toISOString() })
      .eq("seller_id", sellerId)
      .is("olist_ingest_token", null)
      .select("olist_ingest_token")
      .maybeSingle();

    if (!upErr && upd?.olist_ingest_token) return String(upd.olist_ingest_token).trim();

    const { data: again } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("olist_ingest_token")
      .eq("seller_id", sellerId)
      .maybeSingle();
    const t2 = String(again?.olist_ingest_token ?? "").trim();
    if (t2) return t2;

    if (upErr && String(upErr.message ?? "").includes("duplicate")) continue;
    if (upErr) {
      console.error("[olistIngestToken] update:", upErr.message);
      return null;
    }
  }
  return null;
}

/** Invalida o link anterior na Olist/Tiny (o seller deve colar a nova URL). */
export async function regenerateSellerOlistIngestToken(sellerId: string): Promise<string | null> {
  const { data: cur, error: selErr } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_account_cnpj_normalized")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (selErr) {
    if (String(selErr.message ?? "").toLowerCase().includes("olist_ingest_token") || selErr.code === "42703") {
      return null;
    }
    console.error("[olistIngestToken] regenerate select:", selErr.message);
    return null;
  }

  const cnpj = String(cur?.olist_account_cnpj_normalized ?? "").trim();
  if (cnpj.length < 11) return null;

  for (let i = 0; i < 6; i++) {
    const token = newOlistIngestToken();
    const { data: upd, error: upErr } = await supabaseAdmin
      .from("seller_olist_integrations")
      .update({ olist_ingest_token: token, updated_at: new Date().toISOString() })
      .eq("seller_id", sellerId)
      .select("olist_ingest_token")
      .maybeSingle();

    if (!upErr && upd?.olist_ingest_token) return String(upd.olist_ingest_token).trim();
    if (upErr && String(upErr.message ?? "").includes("duplicate")) continue;
    if (upErr) {
      console.error("[olistIngestToken] regenerate update:", upErr.message);
      return null;
    }
  }
  return null;
}
