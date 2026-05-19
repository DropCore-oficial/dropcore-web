/**
 * Sincroniza mensalidades pendentes com o Mercado Pago (PIX guardado + busca por external_reference para cartão).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mercadoPagoOrderIndicaPagamentoCredito } from "@/lib/mercadoPagoOrderPaid";
import { processarMensalidadePaga } from "@/lib/mensalidadePixProcessor";

type MensalidadePendente = {
  id: string;
  mp_order_id: string | null;
  mp_payment_id: string | null;
};

async function pagamentoAprovadoPorIds(
  mpToken: string,
  m: MensalidadePendente,
  isTestMode: boolean,
): Promise<boolean> {
  if (isTestMode && m.mp_order_id) {
    const res = await fetch(`https://api.mercadopago.com/v1/orders/${m.mp_order_id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const order = await res.json();
    const payments = order?.transactions?.payments ?? [];
    const anyApproved = payments.some((p: { status?: string }) => p?.status === "approved");
    const orderProcessed = order?.status === "processed";
    if (res.ok && (orderProcessed || anyApproved || mercadoPagoOrderIndicaPagamentoCredito(order))) {
      return true;
    }
  }

  if (m.mp_payment_id) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${m.mp_payment_id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const payment = await res.json();
    if (res.ok && payment?.status === "approved") return true;
  }

  return false;
}

async function pagamentoAprovadoPorBusca(
  mpToken: string,
  mensalidadeId: string,
): Promise<{ aprovado: boolean; payment_id?: string }> {
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", mensalidadeId);
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  const data = await res.json();
  if (!res.ok) return { aprovado: false };

  const results = (data?.results ?? []) as { id?: number | string; status?: string }[];
  const approved = results.find((p) => p.status === "approved");
  if (!approved) return { aprovado: false };

  return {
    aprovado: true,
    payment_id: approved.id != null ? String(approved.id) : undefined,
  };
}

export async function sincronizarMensalidadesPendentesEntidade(
  tipo: "seller" | "fornecedor",
  entidadeId: string,
): Promise<number> {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) return 0;

  const { data: pendentes } = await supabaseAdmin
    .from("financial_mensalidades")
    .select("id, mp_order_id, mp_payment_id")
    .eq("tipo", tipo)
    .eq("entidade_id", entidadeId)
    .in("status", ["pendente", "inadimplente"]);

  if (!pendentes?.length) return 0;

  const isTestMode =
    process.env.MERCADOPAGO_TEST_MODE === "true" || process.env.MERCADOPAGO_TEST_MODE === "1";

  let pagas = 0;
  for (const m of pendentes as MensalidadePendente[]) {
    let aprovado = await pagamentoAprovadoPorIds(mpToken, m, isTestMode);

    if (!aprovado) {
      const busca = await pagamentoAprovadoPorBusca(mpToken, m.id);
      if (busca.aprovado) {
        aprovado = true;
        if (busca.payment_id && !m.mp_payment_id) {
          await supabaseAdmin
            .from("financial_mensalidades")
            .update({ mp_payment_id: busca.payment_id })
            .eq("id", m.id);
        }
      }
    }

    if (aprovado) {
      const ok = await processarMensalidadePaga(m.id);
      if (ok) pagas++;
    }
  }

  return pagas;
}
