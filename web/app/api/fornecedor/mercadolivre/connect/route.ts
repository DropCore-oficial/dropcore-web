/**
 * GET /api/fornecedor/mercadolivre/connect — redireciona pra tela de autorização do
 * Mercado Livre. Link direto (não fetch), sem checar sessão aqui: a troca de código exige
 * sessão autenticada (POST /api/fornecedor/mercadolivre/oauth na volta). Espelho de
 * /api/seller/mercadolivre/connect.
 */
import { NextResponse } from "next/server";
import {
  MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_COOKIE,
  MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_MAX_AGE_SECONDS,
  buildMercadoLivreFornecedorAuthorizationUrl,
} from "@/lib/mercadoLivreOAuthFornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const url = buildMercadoLivreFornecedorAuthorizationUrl(state);
    const res = NextResponse.redirect(url);
    res.cookies.set(MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MERCADOLIVRE_FORNECEDOR_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
