/**
 * GET /api/seller/bling — Vínculo Bling + últimos webhooks recebidos
 * PUT /api/seller/bling — Salva bling_company_id (ID da empresa no Bling)
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSellerFromToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return seller;
}

function normalizeCompanyId(v: string): string {
  return v.trim().slice(0, 128);
}

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const origin = new URL(req.url).origin;

    const { data: row, error } = await supabaseAdmin
      .from("seller_bling_integrations")
      .select("bling_company_id, updated_at")
      .eq("seller_id", seller.id)
      .maybeSingle();

    if (error) {
      if (error.message?.toLowerCase().includes("does not exist")) {
        return NextResponse.json({
          bling_unavailable: true,
          webhook_url: `${origin}/api/webhooks/bling`,
          bling_company_id: null,
          bling_events: [],
        });
      }
      console.error("[seller/bling GET]", error.message);
      return NextResponse.json({ error: "Erro ao carregar." }, { status: 500 });
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
      bling_company_id: row?.bling_company_id ?? null,
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
    const bling_company_id = normalizeCompanyId(String(body?.bling_company_id ?? ""));
    if (!bling_company_id) {
      return NextResponse.json({ error: "Informe o ID da empresa no Bling (companyId)." }, { status: 400 });
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
