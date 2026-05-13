/**
 * POST /api/seller/olist/sync — Dispara sincronização de pedidos Olist/Tiny para o seller logado.
 */
import { NextResponse } from "next/server";
import { runSellerOlistSyncForSellerId } from "@/lib/sellerOlistSync";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_COOLDOWN_MS = 60_000;

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: integrationRow, error: integrationErr } = await supabaseAdmin
      .from("seller_olist_integrations")
      .select("olist_last_sync_at")
      .eq("seller_id", seller.id)
      .maybeSingle();

    if (integrationErr) {
      const msg = String(integrationErr.message ?? "").toLowerCase();
      if (!msg.includes("olist_last_sync_at") && integrationErr.code !== "42703") {
        console.error("[seller/olist/sync POST] integration lookup:", integrationErr.message);
        return NextResponse.json({ error: "Erro ao consultar integração Olist/Tiny." }, { status: 500 });
      }
    } else if (integrationRow?.olist_last_sync_at) {
      const lastSync = new Date(integrationRow.olist_last_sync_at);
      const elapsed = Date.now() - lastSync.getTime();
      if (!Number.isNaN(lastSync.getTime()) && elapsed < SYNC_COOLDOWN_MS) {
        const retryAfter = Math.max(1, Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000));
        return NextResponse.json(
          {
            error: "Aguarde antes de sincronizar novamente.",
            retry_after_seconds: retryAfter,
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
          }
        );
      }
    }

    const result = await runSellerOlistSyncForSellerId(seller.id);
    if (!result) {
      return NextResponse.json(
        { error: "Salve o token API da Olist/Tiny antes de sincronizar pedidos." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      sync: result,
    });
  } catch (e: unknown) {
    console.error("[seller/olist/sync POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
