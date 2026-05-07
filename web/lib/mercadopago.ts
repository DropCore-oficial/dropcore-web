/**
 * Helpers para Mercado Pago (PIX).
 * Configure MERCADOPAGO_ACCESS_TOKEN nas variáveis de ambiente.
 *
 * Modo teste: MERCADOPAGO_TEST_MODE=true usa API Orders (/v1/orders)
 * com test@testuser.com — necessário para credenciais de teste.
 */
export type CobrancaPixResult = {
  ok: true;
  payment_id: string;
  order_id?: string; // ID da order MP (para polling)
  qr_code: string;
  qr_code_base64: string;
  ticket_url?: string;
} | {
  ok: false;
  error: string;
};

function isTestMode(): boolean {
  const v = process.env.MERCADOPAGO_TEST_MODE;
  return v === "true" || v === "1" || String(v).toLowerCase() === "yes";
}

/** Evita devolver JSON cru da API do MP para o utilizador (Orders/Payments). */
function mensagemErroApiMercadoPago(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "Não foi possível criar o PIX. Tente de novo em instantes.";
  }
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  const errors = d.errors;
  if (Array.isArray(errors) && errors.length > 0 && errors[0] && typeof errors[0] === "object") {
    const e0 = errors[0] as Record<string, unknown>;
    const details = e0.details;
    if (Array.isArray(details)) {
      const detTxt = details.filter((x): x is string => typeof x === "string").join(" ");
      if (detTxt.includes("external_reference") && detTxt.includes("length")) {
        return "O código interno do PIX era longo demais para o Mercado Pago. Atualize a página e gere o PIX de novo.";
      }
    }
    if (typeof e0.message === "string" && e0.message.trim()) return e0.message.trim();
  }
  return "Não foi possível criar o PIX. Tente de novo em instantes.";
}

/** Usa API Orders (Checkout v2) — suporta credenciais de teste com PIX */
async function criarCobrancaPixOrders(params: {
  valor: number;
  external_reference: string;
}): Promise<CobrancaPixResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token?.trim()) {
    return { ok: false, error: "Mercado Pago não configurado." };
  }

  const valorStr = (Math.round(params.valor * 100) / 100).toFixed(2);
  const idempotencyKey = `order-${params.external_reference}-${Date.now()}`;

  const res = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      type: "online",
      external_reference: params.external_reference,
      total_amount: valorStr,
      payer: {
        email: "test@testuser.com",
        first_name: "APRO",
      },
      transactions: {
        payments: [
          {
            amount: valorStr,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
          },
        ],
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, error: mensagemErroApiMercadoPago(data) };
  }

  const payment = data?.transactions?.payments?.[0];
  const pm = payment?.payment_method ?? {};
  const qrCode = pm.qr_code ?? "";
  const qrCodeBase64 = pm.qr_code_base64 ?? "";
  const ticketUrl = pm.ticket_url ?? "";

  if (!qrCode && !qrCodeBase64) {
    return { ok: false, error: "Resposta do Mercado Pago sem dados PIX." };
  }

  return {
    ok: true,
    payment_id: String(payment?.id ?? data?.id ?? ""),
    order_id: String(data?.id ?? ""),
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    ticket_url: ticketUrl || undefined,
  };
}

/** Usa API Payments clássica — para produção */
async function criarCobrancaPixPayments(params: {
  valor: number;
  descricao: string;
  email: string;
  external_reference: string;
}): Promise<CobrancaPixResult> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token?.trim()) {
    return { ok: false, error: "Mercado Pago não configurado." };
  }

  const idempotencyKey = `pix-${params.external_reference}-${Date.now()}`;

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: Math.round(params.valor * 100) / 100,
      description: params.descricao,
      payment_method_id: "pix",
      payer: { email: params.email },
      external_reference: params.external_reference,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, error: mensagemErroApiMercadoPago(data) };
  }

  const poi = data?.point_of_interaction?.transaction_data;
  const qrCode = poi?.qr_code ?? "";
  const qrCodeBase64 = poi?.qr_code_base64 ?? "";
  const ticketUrl = data?.point_of_interaction?.ticket_url ?? data?.transaction_details?.external_resource_url;

  if (!qrCode && !qrCodeBase64) {
    return { ok: false, error: "Resposta do Mercado Pago sem dados PIX." };
  }

  return {
    ok: true,
    payment_id: String(data?.id ?? ""),
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    ticket_url: ticketUrl,
  };
}

export async function criarCobrancaPix(params: {
  valor: number;
  descricao: string;
  email: string;
  external_reference: string;
}): Promise<CobrancaPixResult> {
  try {
    if (isTestMode()) {
      return criarCobrancaPixOrders({
        valor: params.valor,
        external_reference: params.external_reference,
      });
    }
    return criarCobrancaPixPayments(params);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return { ok: false, error: String(msg) };
  }
}
