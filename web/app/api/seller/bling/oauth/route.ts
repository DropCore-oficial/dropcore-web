/**
 * POST /api/seller/bling/oauth — Troca authorization_code do Bling por tokens e resolve a
 * empresa, mas NÃO salva ainda — devolve um `confirm_token` pra POST /api/seller/bling/oauth/confirmar.
 *
 * Por quê: diferente do Mercado Livre, o DropCore não controla o início do fluxo OAuth do
 * Bling (o seller autoriza inteiramente dentro do painel do Bling, sem passar por uma URL
 * que o DropCore gera) — não dá pra usar o mesmo par state+cookie anti-CSRF. Sem isso, um
 * atacante podia pegar um `code` da própria conta Bling dele e induzir a vítima (autenticada
 * no DropCore) a completar o link, linkando a empresa Bling do atacante ao seller da vítima.
 * Mitigação real aqui: nunca salvar em silêncio — resolver a empresa primeiro e exigir
 * confirmação explícita do seller vendo o nome dela antes de persistir (achado 2026-10-13).
 */
import { NextResponse } from "next/server";
import { exchangeBlingAuthorizationCode } from "@/lib/blingOAuth";
import { resolveBlingCompanyId, resolveBlingCompanyName } from "@/lib/blingCompanyId";
import { getSellerFromToken } from "@/lib/sellerBlingAuth";
import { encryptSellerErpSecret } from "@/lib/sellerErpSecretBox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TOKEN_VALIDADE_MS = 10 * 60 * 1000;

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
    const [resolvedCompanyId, resolvedCompanyName] = await Promise.all([
      resolveBlingCompanyId(tokens.access_token),
      resolveBlingCompanyName(tokens.access_token).catch(() => null),
    ]);

    const pending = {
      seller_id: seller.id,
      org_id: seller.org_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_in: tokens.expires_in ?? null,
      company_id: resolvedCompanyId,
      exp: Date.now() + CONFIRM_TOKEN_VALIDADE_MS,
    };
    const confirmToken = encryptSellerErpSecret(JSON.stringify(pending));

    return NextResponse.json({
      ok: true,
      pending: true,
      bling_company_id: resolvedCompanyId,
      bling_company_name: resolvedCompanyName,
      confirm_token: confirmToken,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    const status = message.includes("BLING_CLIENT_ID") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
