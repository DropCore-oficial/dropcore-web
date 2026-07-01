import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SyncOlistPrecosCatalogoResult } from "@/lib/sellerOlistSyncPrecosCatalogo";

export type SellerOlistPrecosSyncSummary = {
  grupos: number;
  grupos_ok: number;
  ok: number;
  falhas: number;
  ignorados_sem_custo?: number;
  origem?: "cron" | "manual" | "custo_change";
};

export function deriveSellerOlistPrecosSyncStatus(summary: {
  ok: number;
  falhas: number;
  grupos?: number;
}): "ok" | "parcial" | "erro" {
  if (summary.falhas > 0 && summary.ok === 0) return "erro";
  if (summary.falhas > 0) return "parcial";
  if (summary.ok > 0 || (summary.grupos ?? 0) === 0) return "ok";
  return "parcial";
}

export function summaryFromPrecosCatalogoResult(
  result: SyncOlistPrecosCatalogoResult,
  origem: SellerOlistPrecosSyncSummary["origem"] = "cron",
): SellerOlistPrecosSyncSummary {
  return {
    grupos: result.grupos,
    grupos_ok: result.grupos_ok,
    ok: result.ok,
    falhas: result.falhas.length,
    ignorados_sem_custo: result.ignorados_sem_custo,
    origem,
  };
}

export async function saveSellerOlistPrecosSyncResult(
  sellerId: string,
  params: {
    status: "ok" | "parcial" | "erro";
    error?: string | null;
    summary: SellerOlistPrecosSyncSummary;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("seller_olist_integrations")
    .update({
      olist_last_precos_sync_at: now,
      olist_last_precos_sync_status: params.status,
      olist_last_precos_sync_error: params.error?.trim() || null,
      olist_last_precos_sync_summary: params.summary,
    })
    .eq("seller_id", sellerId);

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("olist_last_precos_sync") || error.code === "42703") return;
    throw new Error(error.message);
  }
}
