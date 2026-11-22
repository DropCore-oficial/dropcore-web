/**
 * POST /api/fornecedor/mercadolivre/oauth — Troca authorization_code do Mercado Livre por
 * tokens e persiste por fornecedor. Espelho de /api/seller/mercadolivre/oauth.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import {
  MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_COOKIE,
  computeMercadoLivreFornecedorAccessTokenExpiresAt,
  exchangeMercadoLivreFornecedorAuthorizationCode,
} from "@/lib/mercadoLivreOAuthFornecedor";
import { encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAuthorizationCode(raw: string): string {
  return raw.trim().slice(0, 512);
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeAuthorizationCode(String(body?.code ?? ""));
    if (!code) {
      return NextResponse.json({ error: "Informe o código de autorização do Mercado Livre." }, { status: 400 });
    }

    const state = String(body?.state ?? "").trim();
    const expectedState = req.cookies.get(MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_COOKIE)?.value ?? "";
    if (!state || !expectedState || state !== expectedState) {
      return NextResponse.json(
        { error: "Sessão de autorização expirada ou inválida. Volte e conecte de novo." },
        { status: 400 },
      );
    }

    const tokens = await exchangeMercadoLivreFornecedorAuthorizationCode(code);
    const expiresAt = computeMercadoLivreFornecedorAccessTokenExpiresAt(tokens.expires_in);

    const { error: upErr } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_upsert", {
      p_fornecedor_id: ctx.fornecedor_id,
      p_org_id: ctx.org_id,
      p_ml_user_id: tokens.user_id != null ? String(tokens.user_id) : null,
      p_ml_access_token: encryptSellerErpSecret(tokens.access_token),
      p_ml_refresh_token: tokens.refresh_token ? encryptSellerErpSecret(tokens.refresh_token) : null,
      p_ml_access_token_expires_at: expiresAt,
    });

    if (upErr) {
      console.error("[fornecedor/mercadolivre/oauth POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar tokens do Mercado Livre." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: ctx.org_id,
      actorUserId: ctx.user_id,
      action: "marketplace.mercadolivre.conectar_oauth",
      targetTable: "fornecedor_mercadolivre_integrations",
      targetId: ctx.fornecedor_id,
    });

    const res = NextResponse.json({
      ok: true,
      oauth_connected: true,
      ml_user_id: tokens.user_id ?? null,
      access_token_expires_at: expiresAt,
    });
    res.cookies.delete(MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_COOKIE);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    const status = message.includes("MERCADOLIVRE_FORNECEDOR_CLIENT_ID") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
