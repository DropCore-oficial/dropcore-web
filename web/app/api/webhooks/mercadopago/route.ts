/**
 * POST /api/webhooks/mercadopago
 * Webhook do Mercado Pago. Configure esta URL no painel do MP.
 * - type=payment: usa external_reference do payment
 * - type=order: usa external_reference da order (modo teste / API Orders)
 * - external_reference = mensalidade_id → marca mensalidade como paga
 * - external_reference = upgrade-pro-{id} → ativa Pro (não credita saldo)
 * - external_reference = deposito-{id} → aprova depósito e credita seller
 */
import { NextResponse } from "next/server";
import { mercadoPagoOrderIndicaPagamentoCredito } from "@/lib/mercadoPagoOrderPaid";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";
import { processarMensalidadePaga } from "@/lib/mensalidadePixProcessor";
import { processarUpgradeProAprovado } from "@/lib/upgradeProPixProcessor";
import { processarCalculadoraRenovacaoPaga } from "@/lib/calculadoraRenovacaoPixProcessor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function processarPorExtRef(extRef: string, mpPaymentId?: string | null): Promise<void> {
  if (!extRef.trim()) return;

  if (extRef.startsWith("upgrade-pro-")) {
    await processarUpgradeProAprovado(extRef);
    return;
  }

  if (extRef.startsWith("deposito-")) {
    await processarDepositoAprovado(extRef);
    return;
  }

  if (extRef.startsWith("crcalc") || extRef.startsWith("calc-renew::")) {
    await processarCalculadoraRenovacaoPaga(extRef, mpPaymentId ?? null);
    return;
  }

  // Mensalidade: id direto (UUID)
  await processarMensalidadePaga(extRef);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "");
    const action = String(body?.action ?? "");
    const data = body?.data ?? {};
    const orderId = data?.id ?? data?.ID;
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!token?.trim()) {
      return NextResponse.json({ received: true });
    }

    let extRef = "";
    let mpPaymentIdOut: string | null = null;

    // type=order (API Orders / modo teste)
    if (type === "order" && orderId) {
      const oid = String(orderId);
      let order: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`https://api.mercadopago.com/v1/orders/${oid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        order = (await res.json()) as Record<string, unknown>;
        if (res.ok && mercadoPagoOrderIndicaPagamentoCredito(order)) {
          extRef = String(order?.external_reference ?? "").trim();
          const payments = (order?.transactions as { payments?: { id?: string }[] })?.payments ?? [];
          mpPaymentIdOut = payments[0]?.id ? String(payments[0].id) : null;
          break;
        }
        if (action === "order.action_required" && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2500));
        } else break;
      }
    }

    // type=payment (API Payments clássica)
    if (type === "payment" && data?.id) {
      const paymentId = String(data.id);
      mpPaymentIdOut = paymentId;
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payment = await res.json();
      if (res.ok && payment?.status === "approved") {
        extRef = (payment?.external_reference ?? "").trim();
      }
    }

    if (extRef) {
      await processarPorExtRef(extRef, mpPaymentIdOut);
    }

    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    console.error("[webhook mercadopago]", e);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
