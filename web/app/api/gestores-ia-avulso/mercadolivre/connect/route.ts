/**
 * GET /api/gestores-ia-avulso/mercadolivre/connect — redireciona pra tela de autorização do
 * Mercado Livre (app próprio do avulso). Link direto, sem checar sessão aqui: a troca de
 * código exige sessão autenticada (POST .../oauth na volta).
 */
import { NextResponse } from "next/server";
import {
  MERCADOLIVRE_AVULSO_OAUTH_STATE_COOKIE,
  MERCADOLIVRE_AVULSO_OAUTH_STATE_MAX_AGE_SECONDS,
  buildMercadoLivreAvulsoAuthorizationUrl,
} from "@/lib/mercadoLivreOAuthAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const url = buildMercadoLivreAvulsoAuthorizationUrl(state);
    const res = NextResponse.redirect(url);
    res.cookies.set(MERCADOLIVRE_AVULSO_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MERCADOLIVRE_AVULSO_OAUTH_STATE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
