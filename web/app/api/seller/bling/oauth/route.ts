/**
 * POST /api/seller/bling/oauth — Troca authorization_code do Bling por tokens e persiste por seller.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  computeBlingAccessTokenExpiresAt,
  exchangeBlingAuthorizationCode,
} from "@/lib/blingOAuth";
import { resolveBlingCompanyId, pickBlingCompanyIdForStorage } from "@/lib/blingCompanyId";
import { getSellerFromToken } from "@/lib/sellerBlingAuth";

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
      return NextResponse.json({ error: "Informe o código de autorização do Bling." }, { status: 400 });
    }

    const tokens = await exchangeBlingAuthorizationCode(code);
    const expiresAt = computeBlingAccessTokenExpiresAt(tokens.expires_in);
    const resolvedCompanyId = await resolveBlingCompanyId(tokens.access_token);

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("seller_bling_integrations")
      .select("bling_company_id")
      .eq("seller_id", seller.id)
      .maybeSingle();

    if (existingErr) {
      const msg = String(existingErr.message ?? "").toLowerCase();
      const codeErr = String((existingErr as { code?: string }).code ?? "");
      const tabelaInexistente =
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        codeErr === "42P01" ||
        codeErr === "PGRST205";
      if (tabelaInexistente) {
        return NextResponse.json(
          { error: "Execute os scripts add-seller-bling.sql e add-seller-bling-oauth.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[seller/bling/oauth POST lookup]", existingErr.message);
      return NextResponse.json({ error: "Erro ao ler integração Bling." }, { status: 500 });
    }

    const companyIdToSave = pickBlingCompanyIdForStorage(existing?.bling_company_id, resolvedCompanyId);

    const { error: upErr } = await supabaseAdmin.from("seller_bling_integrations").upsert(
      {
        seller_id: seller.id,
        org_id: seller.org_id,
        bling_company_id: companyIdToSave,
        bling_access_token: tokens.access_token,
        bling_refresh_token: tokens.refresh_token ?? null,
        bling_access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id" },
    );

    if (upErr) {
      const msg = String(upErr.message ?? "").toLowerCase();
      if (msg.includes("does not exist") || msg.includes("bling_access_token")) {
        return NextResponse.json(
          { error: "Execute o script add-seller-bling-oauth.sql no Supabase." },
          { status: 503 },
        );
      }
      console.error("[seller/bling/oauth POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar tokens do Bling." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      oauth_connected: true,
      bling_company_id: companyIdToSave,
      access_token_expires_at: expiresAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    const status = message.includes("BLING_CLIENT_ID") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
