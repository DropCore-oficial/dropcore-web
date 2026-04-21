/**
 * GET /api/seller/erp-estoque-webhook — URL configurada + se há segredo salvo
 * PUT /api/seller/erp-estoque-webhook — Salva URL e/ou segredo (Bearer seller)
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SellerWebhookRow = {
  id: string;
  org_id: string;
  erp_estoque_webhook_url: string | null;
  erp_estoque_webhook_secret: string | null;
};

async function loadSeller(req: Request): Promise<
  | { kind: "unauthorized" }
  | { kind: "missing_columns" }
  | { kind: "not_found" }
  | { kind: "ok"; seller: SellerWebhookRow }
> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { kind: "unauthorized" };

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return { kind: "unauthorized" };

  const { data: seller, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error?.code === "42703" || String(error?.message ?? "").toLowerCase().includes("does not exist")) {
    return { kind: "missing_columns" };
  }
  if (error) {
    console.error("[seller/erp-estoque-webhook]", error.message);
    return { kind: "not_found" };
  }
  if (!seller) return { kind: "not_found" };

  return { kind: "ok", seller: seller as SellerWebhookRow };
}

export async function GET(req: Request) {
  try {
    const r = await loadSeller(req);
    if (r.kind === "unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (r.kind === "missing_columns") {
      return NextResponse.json(
        { error: "Execute o script add-seller-erp-estoque-webhook.sql no Supabase.", columns_missing: true },
        { status: 503 }
      );
    }
    if (r.kind === "not_found") {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const url = (r.seller.erp_estoque_webhook_url ?? "").trim() || null;
    const hasSecret = Boolean((r.seller.erp_estoque_webhook_secret ?? "").trim());

    return NextResponse.json({ url, has_secret: hasSecret });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const r = await loadSeller(req);
    if (r.kind === "unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (r.kind === "missing_columns") {
      return NextResponse.json(
        { error: "Execute o script add-seller-erp-estoque-webhook.sql no Supabase.", columns_missing: true },
        { status: 503 }
      );
    }
    if (r.kind === "not_found") {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      url?: unknown;
      secret?: unknown;
    };

    const patch: Record<string, string | null> = {};

    if ("url" in body) {
      const raw = body.url == null ? "" : String(body.url).trim();
      if (raw === "") {
        patch.erp_estoque_webhook_url = null;
      } else {
        let u: URL;
        try {
          u = new URL(raw);
        } catch {
          return NextResponse.json({ error: "URL inválida." }, { status: 400 });
        }
        if (u.protocol === "https:") {
          patch.erp_estoque_webhook_url = raw;
        } else if (
          process.env.NODE_ENV !== "production" &&
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname.toLowerCase())
        ) {
          patch.erp_estoque_webhook_url = raw;
        } else {
          return NextResponse.json(
            {
              error:
                process.env.NODE_ENV === "production"
                  ? "Em produção use apenas URL https://."
                  : "Use https:// ou http://localhost (ou 127.0.0.1) em desenvolvimento.",
            },
            { status: 400 }
          );
        }
      }
    }

    if ("secret" in body) {
      const s = body.secret == null ? "" : String(body.secret);
      if (s === "") {
        patch.erp_estoque_webhook_secret = null;
      } else {
        patch.erp_estoque_webhook_secret = s.trim().slice(0, 512);
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Envie url e/ou secret." }, { status: 400 });
    }

    const { error: upErr } = await supabaseAdmin.from("sellers").update(patch).eq("id", r.seller.id);

    if (upErr) {
      if (upErr.code === "42703" || String(upErr.message ?? "").toLowerCase().includes("does not exist")) {
        return NextResponse.json(
          { error: "Execute o script add-seller-erp-estoque-webhook.sql no Supabase.", columns_missing: true },
          { status: 503 }
        );
      }
      console.error("[seller/erp-estoque-webhook PUT]", upErr.message);
      return NextResponse.json({ error: "Erro ao salvar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
