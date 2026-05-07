/**
 * POST /api/calculadora/renovacao-pix/sync
 * Consulta o Mercado Pago se o PIX pendente já foi aprovado (fallback ao webhook em localhost).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mercadoPagoOrderIndicaPagamentoCredito } from "@/lib/mercadoPagoOrderPaid";
import { processarCalculadoraRenovacaoPaga } from "@/lib/calculadoraRenovacaoPixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    }

    const userId = userData.user.id;
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken?.trim()) {
      return NextResponse.json({ ok: true, atualizado: false });
    }

    const { data: assin } = await supabaseAdmin
      .from("calculadora_assinantes")
      .select("mp_renovacao_pendente_id")
      .eq("user_id", userId)
      .maybeSingle();

    const pendenteId = (assin as { mp_renovacao_pendente_id?: string | null } | null)?.mp_renovacao_pendente_id?.trim();
    if (!pendenteId) {
      return NextResponse.json({ ok: true, atualizado: false });
    }

    const isTestMode =
      process.env.MERCADOPAGO_TEST_MODE === "true" || process.env.MERCADOPAGO_TEST_MODE === "1";

    const resPay = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(pendenteId)}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const payment = (await resPay.json()) as Record<string, unknown>;

    if (resPay.ok && String(payment?.status ?? "").toLowerCase() === "approved") {
      const extRef = String(payment?.external_reference ?? "").trim();
      const payId = String(payment?.id ?? pendenteId);
      const ok = await processarCalculadoraRenovacaoPaga(extRef, payId);
      return NextResponse.json({ ok: true, atualizado: ok });
    }

    if (isTestMode) {
      const resOrder = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(pendenteId)}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const order = (await resOrder.json()) as Record<string, unknown>;
      if (resOrder.ok && mercadoPagoOrderIndicaPagamentoCredito(order)) {
        const extRef = String(order?.external_reference ?? "").trim();
        const payments = (order?.transactions as { payments?: { id?: string }[] })?.payments ?? [];
        const payId = payments[0]?.id ? String(payments[0].id) : pendenteId;
        const ok = await processarCalculadoraRenovacaoPaga(extRef, payId);
        return NextResponse.json({ ok: true, atualizado: ok });
      }
    }

    return NextResponse.json({ ok: true, atualizado: false });
  } catch (e: unknown) {
    console.error("[calculadora renovacao-pix sync]", e);
    return NextResponse.json({ ok: true, atualizado: false });
  }
}
