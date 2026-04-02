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
    .select("id, org_id, fornecedor_id, erp_api_key_prefix, erp_api_key_hash")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return seller;
}

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const has_key = Boolean(seller.erp_api_key_prefix);
    const fornecedor_vinculado = Boolean(seller.fornecedor_id);

    let eventos: Array<{
      id: string;
      tipo_evento: string;
      status_processamento: string;
      erro: string | null;
      referencia_externa: string | null;
      criado_em: string;
      processado_em: string | null;
    }> = [];
    let eventos_unavailable = false;
    let rate_limit_unavailable = false;
    let rate_limit_usage = {
      post_api_key_count: 0,
      patch_api_key_count: 0,
      post_api_key_limit: 30,
      patch_api_key_limit: 30,
    };

    const { data: logs, error: logsErr } = await supabaseAdmin
      .from("erp_event_logs")
      .select("id, tipo_evento, status_processamento, erro, referencia_externa, criado_em, processado_em")
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .order("criado_em", { ascending: false })
      .limit(10);

    if (logsErr) {
      // Se a migration ainda não foi executada, não quebrar a tela.
      if (String(logsErr.message ?? "").toLowerCase().includes("does not exist")) {
        eventos_unavailable = true;
      } else {
        console.error("[seller/erp-diagnostics GET]", logsErr.message);
      }
    } else {
      eventos = (logs ?? []) as typeof eventos;
    }

    if (seller.erp_api_key_hash) {
      const now = new Date();
      now.setSeconds(0, 0);
      const bucket_start = now.toISOString();

      const { data: rlRows, error: rlErr } = await supabaseAdmin
        .from("api_rate_limits")
        .select("route, count")
        .eq("key_type", "api_key")
        .eq("key_value", seller.erp_api_key_hash)
        .eq("bucket_start", bucket_start)
        .in("route", ["erp_pedidos_post", "erp_pedidos_patch"]);

      if (rlErr) {
        if (String(rlErr.message ?? "").toLowerCase().includes("does not exist")) {
          rate_limit_unavailable = true;
        } else {
          console.error("[seller/erp-diagnostics GET rate-limit]", rlErr.message);
        }
      } else {
        for (const r of rlRows ?? []) {
          if (r.route === "erp_pedidos_post") rate_limit_usage.post_api_key_count = Number(r.count ?? 0);
          if (r.route === "erp_pedidos_patch") rate_limit_usage.patch_api_key_count = Number(r.count ?? 0);
        }
      }
    }

    return NextResponse.json({
      has_key,
      key_prefix: seller.erp_api_key_prefix ?? null,
      fornecedor_vinculado,
      integracao_pronta: has_key && fornecedor_vinculado,
      endpoint: "/api/erp/pedidos",
      mode: "sem_webhook_sync",
      suggested_sync_interval_minutes: 1,
      rate_limit_usage,
      rate_limit_unavailable,
      eventos,
      eventos_unavailable,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}

