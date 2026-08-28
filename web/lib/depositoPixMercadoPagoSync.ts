/**
 * Sincroniza depósitos PIX pendentes com o Mercado Pago (polling + busca por external_reference).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";
import {
  mercadoPagoOrderIndicaPagamentoCredito,
  mercadoPagoOrderValorCompativel,
} from "@/lib/mercadoPagoOrderPaid";
import { processarUpgradeProAprovado, SELLER_DEPOSITO_REF_UPGRADE_PRO } from "@/lib/upgradeProPixProcessor";

type DepositoPendente = {
  id: string;
  mp_order_id: string | null;
  mp_payment_id: string | null;
  referencia: string | null;
  valor: number;
};

function isMpTestMode(): boolean {
  const v = process.env.MERCADOPAGO_TEST_MODE;
  return v === "true" || v === "1" || String(v).toLowerCase() === "yes";
}

async function pagamentoAprovadoPorIds(
  mpToken: string,
  d: DepositoPendente,
  isTestMode: boolean,
): Promise<boolean> {
  const isUpgrade = String(d.referencia ?? "") === SELLER_DEPOSITO_REF_UPGRADE_PRO;
  const valorDep = Number(d.valor ?? 0);

  if (isTestMode && d.mp_order_id) {
    const res = await fetch(`https://api.mercadopago.com/v1/orders/${d.mp_order_id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const order = (await res.json()) as Record<string, unknown>;
    return (
      res.ok &&
      mercadoPagoOrderIndicaPagamentoCredito(order) &&
      (isUpgrade || mercadoPagoOrderValorCompativel(order, valorDep))
    );
  }

  if (d.mp_payment_id) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${d.mp_payment_id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const payment = await res.json();
    if (!res.ok || payment?.status !== "approved") return false;
    const amount = Number(payment?.transaction_amount ?? 0);
    if (!isUpgrade && Number.isFinite(amount) && Math.abs(amount - valorDep) > 0.02) return false;
    return true;
  }

  return false;
}

export async function pagamentoAprovadoPorBusca(
  mpToken: string,
  d: DepositoPendente,
): Promise<{ aprovado: boolean; payment_id?: string }> {
  const isUpgrade = String(d.referencia ?? "") === SELLER_DEPOSITO_REF_UPGRADE_PRO;
  const extRef = isUpgrade ? `upgrade-pro-${d.id}` : `deposito-${d.id}`;

  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", extRef);
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  const data = await res.json();
  if (!res.ok) return { aprovado: false };

  const results = (data?.results ?? []) as { id?: number | string; status?: string; transaction_amount?: number }[];
  const approved = results.find((p) => p.status === "approved");
  if (!approved) return { aprovado: false };

  const amount = Number(approved.transaction_amount ?? 0);
  const valorDep = Number(d.valor ?? 0);
  if (!isUpgrade && Number.isFinite(amount) && Math.abs(amount - valorDep) > 0.02) {
    return { aprovado: false };
  }

  return {
    aprovado: true,
    payment_id: approved.id != null ? String(approved.id) : undefined,
  };
}

export async function sincronizarDepositosPendentesSeller(sellerId: string): Promise<number> {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) return 0;

  const { data: pendentes } = await supabaseAdmin
    .from("seller_depositos_pix")
    .select("id, mp_order_id, mp_payment_id, referencia, valor")
    .eq("seller_id", sellerId)
    .eq("status", "pendente");

  if (!pendentes?.length) return 0;

  const isTestMode = isMpTestMode();
  let aprovados = 0;

  for (const row of pendentes as DepositoPendente[]) {
    let aprovado = await pagamentoAprovadoPorIds(mpToken, row, isTestMode);

    if (!aprovado) {
      const busca = await pagamentoAprovadoPorBusca(mpToken, row);
      if (busca.aprovado) {
        aprovado = true;
        if (busca.payment_id && !row.mp_payment_id) {
          await supabaseAdmin
            .from("seller_depositos_pix")
            .update({ mp_payment_id: busca.payment_id })
            .eq("id", row.id);
        }
      }
    }

    if (!aprovado) continue;

    const isUpgrade = String(row.referencia ?? "") === SELLER_DEPOSITO_REF_UPGRADE_PRO;
    const ok = isUpgrade
      ? await processarUpgradeProAprovado(`upgrade-pro-${row.id}`)
      : await processarDepositoAprovado(`deposito-${row.id}`, row.mp_payment_id ?? null);
    if (ok) aprovados++;
  }

  return aprovados;
}
