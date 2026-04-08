/**
 * POST /api/org/calculadora/invites
 * Admin cria convites para a DropCore Calculadora.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";
import { resolveInvitePublicOrigin } from "@/lib/appOrigin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const email_raw = typeof body?.email_alvo === "string" ? body.email_alvo : "";
    const email_alvo = email_raw.trim().toLowerCase() || null;
    const validade_raw = Number(body?.validade_dias ?? 30);
    const validade_dias = Number.isFinite(validade_raw) && validade_raw > 0 && validade_raw <= 365 ? validade_raw : 30;

    if (email_alvo && !email_alvo.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const supabase = supabaseService();
    const { data, error } = await supabase
      .from("calculadora_invites")
      .insert({ email_alvo, validade_dias })
      .select("id, token, email_alvo, validade_dias, expira_em, usado, usado_em, criado_em")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Erro ao criar convite." }, { status: 500 });
    }

    const base = resolveInvitePublicOrigin(req);
    const link =
      base.length > 0
        ? `${base}/calculadora/register/${data.token}`
        : `/calculadora/register/${data.token}`;

    return NextResponse.json({
      ok: true,
      invite: {
        ...data,
        link,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

