/**
 * GET /api/seller/mercadolivre/connect — redireciona pra tela de autorização do Mercado
 * Livre. É um link direto (não fetch), sem checar sessão aqui: a troca de código exige
 * sessão autenticada (POST /api/seller/mercadolivre/oauth na volta), então um visitante
 * deslogado só desperdiça o round-trip, sem risco de vincular conta errada.
 */
import { NextResponse } from "next/server";
import { buildMercadoLivreAuthorizationUrl } from "@/lib/mercadoLivreOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const url = buildMercadoLivreAuthorizationUrl(state);
    return NextResponse.redirect(url);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
