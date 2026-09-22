/**
 * GET /api/seller/mercadolivre — status da conexão OAuth com o Mercado Livre.
 * DELETE /api/seller/mercadolivre — desconecta (remove a linha inteira). Mesmo padrão de
 * DELETE /api/seller/olist — precisa disso pra trocar de conta ML sem intervenção manual
 * (achado ao vivo 2026-09-22: ml_user_id é UNIQUE, uma conta ML só liga a 1 seller por vez).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { logAdminAction } from "@/lib/adminAuditLog";

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

export async function DELETE(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabaseAdmin.from("seller_mercadolivre_integrations").delete().eq("seller_id", seller.id);

  if (error) {
    console.error("[seller/mercadolivre DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao desconectar o Mercado Livre." }, { status: 500 });
  }

  await logAdminAction({
    req,
    orgId: seller.org_id,
    actorUserId: seller.user_id,
    action: "marketplace.mercadolivre.desconectar",
    targetTable: "seller_mercadolivre_integrations",
    targetId: seller.id,
  });

  return NextResponse.json({ ok: true, connected: false });
}
