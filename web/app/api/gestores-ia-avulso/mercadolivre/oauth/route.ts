/**
 * POST /api/gestores-ia-avulso/mercadolivre/oauth — troca authorization_code do Mercado
 * Livre (app do avulso) por tokens e persiste em `calculadora_assinante_mercadolivre_integrations`.
 * Espelho de /api/seller/mercadolivre/oauth, nunca toca na tabela do hub.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeMercadoLivreAvulsoAccessTokenExpiresAt,
  exchangeMercadoLivreAvulsoAuthorizationCode,
} from "@/lib/mercadoLivreOAuthAvulso";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { encryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAuthorizationCode(raw: string): string {
  return raw.trim().slice(0, 512);
}

export async function POST(req: Request) {
  try {
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (assinante.inclui_gestores_ia !== true) {
      return NextResponse.json({ error: "Sua assinatura não inclui o pacote Gestores de IA." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeAuthorizationCode(String(body?.code ?? ""));
    if (!code) {
      return NextResponse.json({ error: "Informe o código de autorização do Mercado Livre." }, { status: 400 });
    }

    const tokens = await exchangeMercadoLivreAvulsoAuthorizationCode(code);
    const expiresAt = computeMercadoLivreAvulsoAccessTokenExpiresAt(tokens.expires_in);

    const { error: upErr } = await supabaseAdmin.from("calculadora_assinante_mercadolivre_integrations").upsert(
      {
        assinante_id: assinante.id,
        ml_user_id: tokens.user_id != null ? String(tokens.user_id) : null,
        ml_access_token: encryptCalculadoraAssinanteSecret(tokens.access_token),
        ml_refresh_token: tokens.refresh_token ? encryptCalculadoraAssinanteSecret(tokens.refresh_token) : null,
        ml_access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assinante_id" },
    );

    if (upErr) {
      console.error("[gestores-ia-avulso/mercadolivre/oauth POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar tokens do Mercado Livre." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      oauth_connected: true,
      ml_user_id: tokens.user_id ?? null,
      access_token_expires_at: expiresAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    const status = message.includes("GESTORES_IA_AVULSO_MERCADOLIVRE") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
