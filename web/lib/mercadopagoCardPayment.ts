/**
 * Pagamento com cartão (API Payments + token do Card Brick).
 */
import { resolveCheckoutPublicOrigin } from "@/lib/mercadopagoCheckout";
import { processarMensalidadePaga } from "@/lib/mensalidadePixProcessor";
import { processarDepositoAprovado } from "@/lib/depositoPixProcessor";

export type PagamentoCartaoResult =
  | { ok: true; payment_id: string; status: string; mensalidade_liberada: boolean }
  | { ok: false; error: string };

export type PagamentoCartaoDepositoResult =
  | { ok: true; payment_id: string; status: string; deposito_liberado: boolean }
  | { ok: false; error: string };

function mensagemErroPagamento(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "Não foi possível processar o cartão. Tente de novo.";
  }
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  const cause = d.cause;
  if (Array.isArray(cause) && cause[0] && typeof cause[0] === "object") {
    const c0 = cause[0] as Record<string, unknown>;
    if (typeof c0.description === "string" && c0.description.trim()) return c0.description.trim();
  }
  return "Não foi possível processar o cartão. Tente de novo.";
}

export async function criarPagamentoCartaoMensalidade(params: {
  valor: number;
  descricao: string;
  email: string;
  external_reference: string;
  token: string;
  payment_method_id: string;
  installments: number;
  issuer_id?: string | number | null;
  req?: Request;
}): Promise<PagamentoCartaoResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return { ok: false, error: "Mercado Pago não configurado." };
  }

  const origin = resolveCheckoutPublicOrigin(params.req);
  const valor = Math.round(params.valor * 100) / 100;
  const idempotencyKey = `card-${params.external_reference}-${Date.now()}`;

  const body: Record<string, unknown> = {
    transaction_amount: valor,
    token: params.token,
    description: params.descricao.slice(0, 256),
    installments: Math.max(1, Math.min(12, Math.floor(params.installments) || 1)),
    payment_method_id: params.payment_method_id,
    payer: { email: params.email },
    external_reference: params.external_reference,
    notification_url: `${origin}/api/webhooks/mercadopago`,
  };

  if (params.issuer_id != null && String(params.issuer_id).trim() !== "") {
    body.issuer_id = String(params.issuer_id);
  }

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: mensagemErroPagamento(data) };
  }

  const status = String(data?.status ?? "");
  const paymentId = data?.id != null ? String(data.id) : "";

  let mensalidadeLiberada = false;
  if (status === "approved") {
    mensalidadeLiberada = await processarMensalidadePaga(params.external_reference, paymentId);
  }

  return {
    ok: true,
    payment_id: paymentId,
    status,
    mensalidade_liberada: mensalidadeLiberada,
  };
}

/** Espelha `criarPagamentoCartaoMensalidade`, mas credita uma recarga de saldo (deposito-pix) em vez de mensalidade. */
export async function criarPagamentoCartaoDepositoPix(params: {
  valor: number;
  descricao: string;
  email: string;
  external_reference: string;
  token: string;
  payment_method_id: string;
  installments: number;
  issuer_id?: string | number | null;
  req?: Request;
}): Promise<PagamentoCartaoDepositoResult> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return { ok: false, error: "Mercado Pago não configurado." };
  }

  const origin = resolveCheckoutPublicOrigin(params.req);
  const valor = Math.round(params.valor * 100) / 100;
  const idempotencyKey = `card-${params.external_reference}-${Date.now()}`;

  const body: Record<string, unknown> = {
    transaction_amount: valor,
    token: params.token,
    description: params.descricao.slice(0, 256),
    installments: Math.max(1, Math.min(12, Math.floor(params.installments) || 1)),
    payment_method_id: params.payment_method_id,
    payer: { email: params.email },
    external_reference: params.external_reference,
    notification_url: `${origin}/api/webhooks/mercadopago`,
  };

  if (params.issuer_id != null && String(params.issuer_id).trim() !== "") {
    body.issuer_id = String(params.issuer_id);
  }

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: mensagemErroPagamento(data) };
  }

  const status = String(data?.status ?? "");
  const paymentId = data?.id != null ? String(data.id) : "";

  let depositoLiberado = false;
  if (status === "approved") {
    depositoLiberado = await processarDepositoAprovado(params.external_reference, paymentId);
  }

  return {
    ok: true,
    payment_id: paymentId,
    status,
    deposito_liberado: depositoLiberado,
  };
}
