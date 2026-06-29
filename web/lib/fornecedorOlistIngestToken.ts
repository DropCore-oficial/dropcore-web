import { newOlistIngestToken } from "@/lib/olistIngestToken";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Garante `olist_ingest_token` quando CNPJ já está gravado (webhook de estoque). */
export async function ensureFornecedorOlistIngestToken(fornecedorId: string): Promise<string | null> {
  const { data: cur, error: selErr } = await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .select("olist_ingest_token, olist_account_cnpj_normalized")
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();

  if (selErr) {
    const msg = String(selErr.message ?? "").toLowerCase();
    if (msg.includes("olist_ingest_token") || selErr.code === "42703") return null;
    console.error("[fornecedorOlistIngestToken] select:", selErr.message);
    return null;
  }

  const cnpj = String(cur?.olist_account_cnpj_normalized ?? "").trim();
  if (cnpj.length < 11) return null;

  const existing = String(cur?.olist_ingest_token ?? "").trim();
  if (existing) return existing;

  for (let i = 0; i < 6; i++) {
    const token = newOlistIngestToken();
    const { data: upd, error: upErr } = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .update({ olist_ingest_token: token, updated_at: new Date().toISOString() })
      .eq("fornecedor_id", fornecedorId)
      .is("olist_ingest_token", null)
      .select("olist_ingest_token")
      .maybeSingle();

    if (!upErr && upd?.olist_ingest_token) return String(upd.olist_ingest_token).trim();

    const { data: again } = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .select("olist_ingest_token")
      .eq("fornecedor_id", fornecedorId)
      .maybeSingle();
    const t2 = String(again?.olist_ingest_token ?? "").trim();
    if (t2) return t2;

    if (upErr && String(upErr.message ?? "").includes("duplicate")) continue;
    if (upErr) {
      console.error("[fornecedorOlistIngestToken] update:", upErr.message);
      return null;
    }
  }
  return null;
}

export async function regenerateFornecedorOlistIngestToken(fornecedorId: string): Promise<string | null> {
  const { data: cur, error: selErr } = await supabaseAdmin
    .from("fornecedor_olist_integrations")
    .select("olist_account_cnpj_normalized")
    .eq("fornecedor_id", fornecedorId)
    .maybeSingle();

  if (selErr) return null;
  const cnpj = String(cur?.olist_account_cnpj_normalized ?? "").trim();
  if (cnpj.length < 11) return null;

  for (let i = 0; i < 6; i++) {
    const token = newOlistIngestToken();
    const { data: upd, error: upErr } = await supabaseAdmin
      .from("fornecedor_olist_integrations")
      .update({ olist_ingest_token: token, updated_at: new Date().toISOString() })
      .eq("fornecedor_id", fornecedorId)
      .select("olist_ingest_token")
      .maybeSingle();

    if (!upErr && upd?.olist_ingest_token) return String(upd.olist_ingest_token).trim();
    if (upErr && String(upErr.message ?? "").includes("duplicate")) continue;
    if (upErr) return null;
  }
  return null;
}
