/**
 * POST /api/seller/bling/oauth/confirmar — Segunda etapa do link OAuth do Bling (ver
 * /api/seller/bling/oauth): recebe o `confirm_token` devolvido depois que o seller viu o
 * nome da empresa resolvida e confirmou explicitamente. Só aqui a integração é de fato salva.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeBlingAccessTokenExpiresAt } from "@/lib/blingOAuth";
import { pickBlingCompanyIdForStorage } from "@/lib/blingCompanyId";
import { getSellerFromToken } from "@/lib/sellerBlingAuth";
import { encryptSellerErpSecret, decryptSellerErpSecret } from "@/lib/sellerErpSecretBox";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingBlingConnection = {
  seller_id: string;
  org_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
  company_id: string | null;
  exp: number;
};

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmToken = String(body?.confirm_token ?? "").trim();
    if (!confirmToken) {
      return NextResponse.json({ error: "Faltou confirm_token." }, { status: 400 });
    }

    let pending: PendingBlingConnection;
    try {
      pending = JSON.parse(decryptSellerErpSecret(confirmToken)) as PendingBlingConnection;
    } catch {
      return NextResponse.json(
        { error: "Confirmação inválida ou expirada. Volte e conecte de novo." },
        { status: 400 },
      );
    }

    if (pending.seller_id !== seller.id) {
      return NextResponse.json(
        { error: "Essa confirmação pertence a outra conta. Conecte de novo pela sua conta." },
        { status: 403 },
      );
    }
    if (!pending.exp || Date.now() > pending.exp) {
      return NextResponse.json(
        { error: "Essa confirmação expirou. Volte e conecte de novo." },
        { status: 400 },
      );
    }

    const expiresAt = computeBlingAccessTokenExpiresAt(pending.expires_in ?? undefined);

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
      console.error("[seller/bling/oauth/confirmar POST lookup]", existingErr.message);
      return NextResponse.json({ error: "Erro ao ler integração Bling." }, { status: 500 });
    }

    const companyIdToSave = pickBlingCompanyIdForStorage(existing?.bling_company_id, pending.company_id);

    const { error: upErr } = await supabaseAdmin.from("seller_bling_integrations").upsert(
      {
        seller_id: seller.id,
        org_id: seller.org_id,
        bling_company_id: companyIdToSave,
        bling_access_token: encryptSellerErpSecret(pending.access_token),
        bling_refresh_token: pending.refresh_token ? encryptSellerErpSecret(pending.refresh_token) : null,
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
      if (upErr.code === "23505") {
        return NextResponse.json(
          { error: "Essa empresa Bling já está vinculada a outra conta DropCore." },
          { status: 409 },
        );
      }
      console.error("[seller/bling/oauth/confirmar POST]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar tokens do Bling." }, { status: 500 });
    }

    await logAdminAction({
      req,
      orgId: seller.org_id,
      actorUserId: seller.user_id,
      action: "erp.bling.conectar_oauth",
      targetTable: "seller_bling_integrations",
      targetId: seller.id,
    });

    return NextResponse.json({
      ok: true,
      oauth_connected: true,
      bling_company_id: companyIdToSave,
      access_token_expires_at: expiresAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
