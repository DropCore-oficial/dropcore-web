/**
 * POST /api/webhooks/bling
 * Recebe webhooks do Bling (documentação: developer.bling.com.br/webhooks).
 * - Valida X-Bling-Signature-256 com BLING_CLIENT_SECRET (app do DropCore na Central de Extensões).
 * - Associa companyId → seller via seller_bling_integrations.
 * - Registra em bling_webhook_logs e responde 200 em ≤5s (requisito Bling).
 *
 * Env: BLING_CLIENT_SECRET (obrigatório em produção). Em dev: BLING_WEBHOOK_SKIP_VERIFY=true para testar sem assinatura.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyBlingSignature256 } from "@/lib/blingSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlingEnvelope = {
  eventId?: string;
  date?: string;
  version?: string;
  event?: string;
  companyId?: string;
  data?: unknown;
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-bling-signature-256");
  const secret = process.env.BLING_CLIENT_SECRET?.trim() ?? "";
  const skipVerify = process.env.BLING_WEBHOOK_SKIP_VERIFY === "true";

  if (!secret && !skipVerify) {
    console.error("[webhooks/bling] BLING_CLIENT_SECRET não configurado.");
    return NextResponse.json({ error: "Integração Bling não configurada no servidor." }, { status: 503 });
  }

  if (secret && !skipVerify) {
    if (!verifyBlingSignature256(rawBody, sigHeader, secret)) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }
  }

  let envelope: BlingEnvelope;
  try {
    envelope = JSON.parse(rawBody) as BlingEnvelope;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const companyId = typeof envelope.companyId === "string" ? envelope.companyId.trim() : "";
  const eventType = typeof envelope.event === "string" ? envelope.event.trim() : "";
  const blingEventId = typeof envelope.eventId === "string" ? envelope.eventId.trim() : null;

  let sellerId: string | null = null;
  let orgId: string | null = null;

  if (companyId) {
    const { data: link, error: linkErr } = await supabaseAdmin
      .from("seller_bling_integrations")
      .select("seller_id, org_id")
      .eq("bling_company_id", companyId)
      .maybeSingle();

    if (linkErr) {
      const msg = String(linkErr.message ?? "").toLowerCase();
      if (!msg.includes("does not exist")) {
        console.error("[webhooks/bling] lookup:", linkErr.message);
      }
    } else if (link) {
      sellerId = link.seller_id;
      orgId = link.org_id;
    }
  }

  const { error: logErr } = await supabaseAdmin.from("bling_webhook_logs").insert({
    seller_id: sellerId,
    org_id: orgId,
    bling_event_id: blingEventId,
    company_id: companyId || null,
    event_type: eventType || null,
    payload: envelope as unknown as Record<string, unknown>,
  });

  if (logErr) {
    const msg = String(logErr.message ?? "").toLowerCase();
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        { error: "Execute o script add-seller-bling.sql no Supabase." },
        { status: 503 }
      );
    }
    console.error("[webhooks/bling] log:", logErr.message);
    return NextResponse.json({ error: "Erro ao registrar evento." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    matched_seller: Boolean(sellerId),
  });
}
