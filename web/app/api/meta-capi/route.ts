/**
 * POST /api/meta-capi
 * Espelha no servidor (Conversions API) o evento já disparado no client via `fbq()` —
 * mesmo `event_id` nos dois lados pra Meta deduplicar. Só usado hoje pelo clique do CTA
 * final da landing (evento "Lead"), ver `web/components/landing/LandingPage.tsx`.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";

const PIXEL_ID = "1042181891938817";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hash(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

type MetaCapiBody = {
  event_name?: unknown;
  event_id?: unknown;
  event_source_url?: unknown;
  user_data?: { email?: unknown; phone?: unknown };
};

export async function POST(req: Request) {
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  if (!accessToken) {
    console.warn("[meta-capi] META_CONVERSIONS_API_TOKEN ausente — evento não enviado");
    return NextResponse.json({ error: "Não configurado" }, { status: 501 });
  }

  let body: MetaCapiBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const eventName = typeof body.event_name === "string" ? body.event_name : null;
  const eventId = typeof body.event_id === "string" ? body.event_id : null;
  const eventSourceUrl = typeof body.event_source_url === "string" ? body.event_source_url : undefined;
  if (!eventName || !eventId) {
    return NextResponse.json({ error: "event_name e event_id são obrigatórios" }, { status: 400 });
  }

  const email = typeof body.user_data?.email === "string" ? body.user_data.email : null;
  const phone = typeof body.user_data?.phone === "string" ? body.user_data.phone : null;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data: {
          client_ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
          client_user_agent: req.headers.get("user-agent") ?? undefined,
          ...(email && { em: [hash(email)] }),
          ...(phone && { ph: [hash(phone)] }),
        },
      },
    ],
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("[meta-capi] Meta respondeu erro:", data);
      return NextResponse.json({ error: "Falha ao enviar evento" }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.warn("[meta-capi] fetch falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Falha ao enviar evento" }, { status: 502 });
  }
}
