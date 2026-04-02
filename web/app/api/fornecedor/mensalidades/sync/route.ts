/**
 * POST /api/fornecedor/mensalidades/sync
 * Verifica no Mercado Pago se mensalidades pendentes já foram pagas.
 * Fallback quando o webhook não chega (ex: localhost).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processarMensalidadePaga } from "@/lib/mensalidadePixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token" }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("fornecedor_id")
      .eq("user_id", userData.user.id)
      .not("fornecedor_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (!member?.fornecedor_id) {
      return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken?.trim()) {
      return NextResponse.json({ ok: true, pagas: 0 });
    }

    const { data: pendentes } = await supabaseAdmin
      .from("financial_mensalidades")
      .select("id, mp_order_id, mp_payment_id")
      .eq("tipo", "fornecedor")
      .eq("entidade_id", member.fornecedor_id)
      .in("status", ["pendente", "inadimplente"])
      .or("mp_order_id.not.is.null,mp_payment_id.not.is.null");

    if (!pendentes?.length) {
      return NextResponse.json({ ok: true, pagas: 0 });
    }

    let pagas = 0;
    const isTestMode = process.env.MERCADOPAGO_TEST_MODE === "true" || process.env.MERCADOPAGO_TEST_MODE === "1";

    for (const m of pendentes) {
      let aprovado = false;

      if (isTestMode && m.mp_order_id) {
        const res = await fetch(`https://api.mercadopago.com/v1/orders/${m.mp_order_id}`, {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        const order = await res.json();
        const payments = order?.transactions?.payments ?? [];
        const anyApproved = payments.some((p: { status?: string }) => p?.status === "approved");
        const orderProcessed = order?.status === "processed";
        if (res.ok && (orderProcessed || anyApproved)) aprovado = true;
      } else if (m.mp_payment_id) {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${m.mp_payment_id}`, {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        const payment = await res.json();
        if (res.ok && payment?.status === "approved") aprovado = true;
      }

      if (aprovado) {
        const ok = await processarMensalidadePaga(m.id);
        if (ok) pagas++;
      }
    }

    return NextResponse.json({ ok: true, pagas });
  } catch (e: unknown) {
    console.error("[mensalidades sync]", e);
    return NextResponse.json({ ok: true, pagas: 0 });
  }
}
