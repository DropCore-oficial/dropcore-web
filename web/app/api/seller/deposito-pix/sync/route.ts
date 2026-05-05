/**
 * POST /api/seller/deposito-pix/sync
 * Verifica depósitos pendentes no Mercado Pago e aprova automaticamente se já pagos.
 * Fallback quando o webhook não chega (ex: ngrok).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";
import { processarUpgradeProAprovado, SELLER_DEPOSITO_REF_UPGRADE_PRO } from "@/lib/upgradeProPixProcessor";
import { mercadoPagoOrderIndicaPagamentoCredito, mercadoPagoOrderValorCompativel } from "@/lib/mercadoPagoOrderPaid";

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

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado" }, { status: 404 });
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken?.trim()) {
      return NextResponse.json({ error: "MP não configurado" }, { status: 500 });
    }

    const { data: pendentes } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, mp_order_id, referencia, valor")
      .eq("seller_id", seller.id)
      .eq("status", "pendente")
      .not("mp_order_id", "is", null);

    if (!pendentes?.length) {
      return NextResponse.json({ ok: true, aprovados: 0 });
    }

    let aprovados = 0;
    for (const d of pendentes) {
      const orderId = d.mp_order_id;
      if (!orderId) continue;

      const res = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const order = (await res.json()) as Record<string, unknown>;

      const valorDep = Number((d as { valor?: number }).valor ?? 0);
      const isUpgrade = String(d.referencia ?? "") === SELLER_DEPOSITO_REF_UPGRADE_PRO;
      const creditoOk =
        res.ok &&
        mercadoPagoOrderIndicaPagamentoCredito(order) &&
        (isUpgrade || mercadoPagoOrderValorCompativel(order, valorDep));

      if (creditoOk) {
        const ok = isUpgrade
          ? await processarUpgradeProAprovado(`upgrade-pro-${d.id}`)
          : await processarDepositoAprovado(`deposito-${d.id}`);
        if (ok) aprovados++;
      }
    }

    return NextResponse.json({ ok: true, aprovados });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
