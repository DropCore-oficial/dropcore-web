/**
 * GET /api/gestores-ia-avulso/mercadolivre/connect — redireciona pra tela de autorização do
 * Mercado Livre (app próprio do avulso). Link direto, sem checar sessão aqui: a troca de
 * código exige sessão autenticada (POST .../oauth na volta).
 */
import { NextResponse } from "next/server";
import { buildMercadoLivreAvulsoAuthorizationUrl } from "@/lib/mercadoLivreOAuthAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const url = buildMercadoLivreAvulsoAuthorizationUrl(state);
    return NextResponse.redirect(url);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
