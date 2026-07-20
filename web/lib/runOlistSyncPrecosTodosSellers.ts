import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSellerOlistRateLimited } from "@/lib/olistRateLimitCooldown";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import {
  deriveSellerOlistPrecosSyncStatus,
  saveSellerOlistPrecosSyncResult,
  summaryFromPrecosCatalogoResult,
} from "@/lib/sellerOlistPrecosSyncPersistence";
import { syncOlistPrecosCatalogoSeller } from "@/lib/sellerOlistSyncPrecosCatalogo";

const SELLER_PAUSE_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cron: sincroniza preços Olist de todos os sellers com token + armazém ligado. */
export async function runOlistSyncPrecosTodosSellers(): Promise<{
  sellers_total: number;
  sellers_synced: number;
  ok: number;
  falhas: number;
  detalhes: Array<{ seller_id: string; grupos_ok: number; ok: number; falhas: number }>;
}> {
  const { data: integrations, error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("seller_id, olist_rate_limited_until")
    .not("olist_token_ciphertext", "is", null);

  if (error) throw new Error(error.message);

  const detalhes: Array<{ seller_id: string; grupos_ok: number; ok: number; falhas: number }> = [];
  let sellersSynced = 0;
  let okTotal = 0;
  let falhasTotal = 0;

  const rateLimitedSellerIds = new Set(
    (integrations ?? [])
      .filter((r) => isSellerOlistRateLimited(r as { olist_rate_limited_until: string | null }))
      .map((r) => String((r as { seller_id: string }).seller_id))
  );
  const sellerIds = [...new Set((integrations ?? []).map((r) => String((r as { seller_id: string }).seller_id)))];

  for (let i = 0; i < sellerIds.length; i += 1) {
    const sellerId = sellerIds[i]!;
    if (rateLimitedSellerIds.has(sellerId)) continue;
    const apiToken = await getSellerOlistApiToken(sellerId);
    if (!apiToken) continue;

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, fornecedor_id")
      .eq("id", sellerId)
      .maybeSingle();

    if (sellerErr || !seller) continue;
    const fornecedorId = (seller as { fornecedor_id?: string | null }).fornecedor_id ?? null;
    const orgId = (seller as { org_id?: string }).org_id;
    if (!fornecedorId || !orgId) continue;

    try {
      const sync = await syncOlistPrecosCatalogoSeller({
        apiToken,
        orgId,
        sellerId,
        fornecedorId,
        supabase: supabaseAdmin,
        scope: "todos",
      });
      if (sync.grupos > 0) sellersSynced += 1;
      okTotal += sync.ok;
      falhasTotal += sync.falhas.length;
      detalhes.push({
        seller_id: sellerId,
        grupos_ok: sync.grupos_ok,
        ok: sync.ok,
        falhas: sync.falhas.length,
      });
      const summary = summaryFromPrecosCatalogoResult(sync, "cron");
      try {
        await saveSellerOlistPrecosSyncResult(sellerId, {
          status: deriveSellerOlistPrecosSyncStatus(summary),
          summary,
        });
      } catch (e: unknown) {
        console.warn("[runOlistSyncPrecosTodosSellers] persist:", sellerId, e);
      }
    } catch (e: unknown) {
      falhasTotal += 1;
      detalhes.push({
        seller_id: sellerId,
        grupos_ok: 0,
        ok: 0,
        falhas: 1,
      });
      try {
        await saveSellerOlistPrecosSyncResult(sellerId, {
          status: "erro",
          error: e instanceof Error ? e.message : "Erro ao sincronizar preços na Olist.",
          summary: { grupos: 0, grupos_ok: 0, ok: 0, falhas: 1, origem: "cron" },
        });
      } catch (persistErr: unknown) {
        console.warn("[runOlistSyncPrecosTodosSellers] persist erro:", sellerId, persistErr);
      }
      console.error("[runOlistSyncPrecosTodosSellers]", sellerId, e);
    }

    if (i + 1 < sellerIds.length) await sleep(SELLER_PAUSE_MS);
  }

  return {
    sellers_total: sellerIds.length,
    sellers_synced: sellersSynced,
    ok: okTotal,
    falhas: falhasTotal,
    detalhes,
  };
}
