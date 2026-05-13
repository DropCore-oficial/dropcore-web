/**
 * GET /api/seller/bling — Vínculo Bling + últimos webhooks recebidos
 * PUT /api/seller/bling — Salva bling_company_id (ID da empresa no Bling)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveExternalWebhookOrigin } from "@/lib/appOrigin";
import { isBlingClientIdMisusedAsCompanyId } from "@/lib/blingCompanyId";
import { getSellerFromToken } from "@/lib/sellerBlingAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCompanyId(v: string): string {
  return v.trim().slice(0, 128);
}

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const origin = resolveExternalWebhookOrigin(req);

    const { data: rows, error } = await supabaseAdmin
      .from("seller_bling_integrations")
      .select("bling_company_id, bling_refresh_token, bling_access_token_expires_at, updated_at")
      .eq("seller_id", seller.id)
      .limit(1);

    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const code = String((error as { code?: string }).code ?? "");
      const tabelaInexistente =
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        code === "42P01" ||
        code === "PGRST205";
      if (tabelaInexistente) {
        return NextResponse.json({
          bling_unavailable: true,
          webhook_url: `${origin}/api/webhooks/bling`,
          bling_company_id: null,
          oauth_connected: false,
          access_token_expires_at: null,
          bling_events: [],
        });
      }
      console.error("[seller/bling GET]", error.message, code);
      const detalhe =
        process.env.NODE_ENV === "development" ? ` (${error.message || code || "sem detalhe"})` : "";
      return NextResponse.json(
        {
          error: `Não foi possível ler a integração Bling no banco.${detalhe} Confira se o script add-seller-bling.sql foi aplicado no Supabase.`,
        },
        { status: 500 },
      );
    }

    const row = rows?.[0] as
      | {
          bling_company_id: string | null;
          bling_refresh_token: string | null;
          bling_access_token_expires_at: string | null;
          updated_at: string | null;
        }
      | null
      | undefined;

    const oauthConnected = Boolean(row?.bling_refresh_token?.trim() || row?.bling_access_token_expires_at);

    let blingCompanyId = row?.bling_company_id ?? null;
    if (isBlingClientIdMisusedAsCompanyId(blingCompanyId)) {
      blingCompanyId = null;
    }
    if (!blingCompanyId) {
      const { data: latestCompanyLog } = await supabaseAdmin
        .from("bling_webhook_logs")
        .select("company_id")
        .eq("seller_id", seller.id)
        .not("company_id", "is", null)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      blingCompanyId = latestCompanyLog?.company_id ?? null;
    }

    const { data: logs, error: logsErr } = await supabaseAdmin
      .from("bling_webhook_logs")
      .select("id, event_type, bling_event_id, company_id, criado_em")
      .eq("seller_id", seller.id)
      .order("criado_em", { ascending: false })
      .limit(8);

    if (logsErr && !String(logsErr.message ?? "").toLowerCase().includes("does not exist")) {
      console.error("[seller/bling GET logs]", logsErr.message);
    }

    return NextResponse.json({
      bling_unavailable: false,
      webhook_url: `${origin}/api/webhooks/bling`,
      bling_company_id: blingCompanyId,
      oauth_connected: oauthConnected,
      access_token_expires_at: row?.bling_access_token_expires_at ?? null,
      updated_at: row?.updated_at ?? null,
      bling_events: (logs ?? []) as Array<{
        id: string;
        event_type: string | null;
        bling_event_id: string | null;
        company_id: string | null;
        criado_em: string;
      }>,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const clearCompanyId = body?.clear_company_id === true;
    const bling_company_id = normalizeCompanyId(String(body?.bling_company_id ?? ""));

    if (clearCompanyId || !bling_company_id) {
      const { error: clearErr } = await supabaseAdmin
        .from("seller_bling_integrations")
        .update({ bling_company_id: null, updated_at: new Date().toISOString() })
        .eq("seller_id", seller.id);

      if (clearErr) {
        if (String(clearErr.message ?? "").toLowerCase().includes("does not exist")) {
          return NextResponse.json(
            { error: "Execute o script add-seller-bling.sql no Supabase." },
            { status: 503 },
          );
        }
        console.error("[seller/bling PUT clear]", clearErr.message);
        return NextResponse.json({ error: "Erro ao limpar o companyId." }, { status: 500 });
      }

      return NextResponse.json({ ok: true, bling_company_id: null });
    }

    if (isBlingClientIdMisusedAsCompanyId(bling_company_id)) {
      return NextResponse.json(
        {
          error:
            "Esse valor é o Client ID do app no Bling, não o companyId da empresa. Limpe o campo e autorize de novo pelo Link de convite.",
        },
        { status: 400 },
      );
    }

    const { error: upErr } = await supabaseAdmin.from("seller_bling_integrations").upsert(
      {
        seller_id: seller.id,
        org_id: seller.org_id,
        bling_company_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id" }
    );

    if (upErr) {
      if (upErr.message?.includes("duplicate") || upErr.code === "23505") {
        return NextResponse.json(
          { error: "Este ID da empresa Bling já está vinculado a outra conta DropCore." },
          { status: 409 }
        );
      }
      if (String(upErr.message ?? "").toLowerCase().includes("does not exist")) {
        return NextResponse.json(
          { error: "Execute o script add-seller-bling.sql no Supabase." },
          { status: 503 }
        );
      }
      console.error("[seller/bling PUT]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, bling_company_id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
