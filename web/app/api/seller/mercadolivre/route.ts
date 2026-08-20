/**
 * GET /api/seller/mercadolivre — status da conexão OAuth com o Mercado Livre.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("ml_user_id, ml_access_token_expires_at, updated_at")
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (error) {
    console.error("[seller/mercadolivre GET]", error.message);
    return NextResponse.json({ error: "Erro ao carregar integração Mercado Livre." }, { status: 500 });
  }

  return NextResponse.json({
    connected: Boolean(data),
    ml_user_id: data?.ml_user_id ?? null,
    access_token_expires_at: data?.ml_access_token_expires_at ?? null,
    updated_at: data?.updated_at ?? null,
  });
}
