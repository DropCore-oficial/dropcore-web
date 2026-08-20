/**
 * POST /api/seller/mercadolivre/oauth — Troca authorization_code do Mercado Livre por
 * tokens e persiste por seller. Espelho de /api/seller/bling/oauth.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeMercadoLivreAccessTokenExpiresAt,
  exchangeMercadoLivreAuthorizationCode,
} from "@/lib/mercadoLivreOAuth";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAuthorizationCode(raw: string): string {
  return raw.trim().slice(0, 512);
}

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeAuthorizationCode(String(body?.code ?? ""));
    if (!code) {
      return NextResponse.json({ error: "Informe o código de autorização do Mercado Livre." }, { status: 400 });
    }

    const tokens = await exchangeMercadoLivreAuthorizationCode(code);
    const expiresAt = computeMercadoLivreAccessTokenExpiresAt(tokens.expires_in);

    const { error: upErr } = await supabaseAdmin.from("seller_mercadolivre_integrations").upsert(
      {
        seller_id: seller.id,
        org_id: seller.org_id,
        ml_user_id: tokens.user_id != null ? String(tokens.user_id) : null,
        ml_access_token: encryptSellerErpSecret(tokens.access_token),
        ml_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : null,
        ml_access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id" },
    );

    if (upErr) {
      console.error("[seller/mercadolivre/oauth POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar tokens do Mercado Livre." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: seller.org_id,
      actorUserId: seller.user_id,
      action: "marketplace.mercadolivre.conectar_oauth",
      targetTable: "seller_mercadolivre_integrations",
      targetId: seller.id,
    });

    return NextResponse.json({
      ok: true,
      oauth_connected: true,
      ml_user_id: tokens.user_id ?? null,
      access_token_expires_at: expiresAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    const status = message.includes("MERCADOLIVRE_CLIENT_ID") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
