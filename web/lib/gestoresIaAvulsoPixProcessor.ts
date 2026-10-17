/**
 * Pagamento da parcela mensal (R$797,90) do pacote avulso "Gestores de IA" via PIX — vale
 * tanto pra quem assina mês a mês quanto pra quem paga uma parcela do contrato anual (mesmo
 * valor, mesma extensão de 1 mês; o que diferencia o contrato anual é só a carência inicial,
 * tratada em `fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar`, sem PIX).
 * Referência externa ≤ 64 caracteres (limite Mercado Pago): giapix + UUID sem hífens (32 hex)
 * + nonce (8 hex) = 46 chars.
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calcularValorMensalGestoresIaAvulso, isGestoresIaAvulsoDescontoTipo } from "@/lib/gestoresIaAvulsoPlanos";
import { computeCalendarCycleValidoAte } from "@/lib/calculadoraRenovacaoValidoAte";
import { valorLiquidoRecebidoMp } from "@/lib/mercadoPagoValorRecebido";

export const GESTORES_IA_AVULSO_PIX_PREFIX = "giapix";

function uuidCompact(userId: string): string {
  return userId.replace(/-/g, "").toLowerCase();
}

function uuidExpand(hex32: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(hex32)) return null;
  const h = hex32.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function buildGestoresIaAvulsoExternalReference(userId: string): string {
  const compact = uuidCompact(userId);
  const nonce = randomBytes(4).toString("hex");
  return `${GESTORES_IA_AVULSO_PIX_PREFIX}${compact}${nonce}`;
}

export function parseGestoresIaAvulsoExternalReference(extRef: string): { userId: string } | null {
  const t = String(extRef ?? "").trim();
  const prefix = GESTORES_IA_AVULSO_PIX_PREFIX;
  const expectedLen = prefix.length + 32 + 8;
  if (!t.startsWith(prefix) || t.length !== expectedLen) return null;

  const payload = t.slice(prefix.length);
  const uuidPart = payload.slice(0, 32);
  const noncePart = payload.slice(32);
  if (!/^[0-9a-f]{32}$/i.test(uuidPart) || !/^[0-9a-f]{8}$/i.test(noncePart)) return null;

  const userId = uuidExpand(uuidPart);
  return userId ? { userId } : null;
}

function valorCompativel(valorMp: unknown, esperado: number): boolean {
  const n = typeof valorMp === "number" ? valorMp : parseFloat(String(valorMp ?? ""));
  if (!Number.isFinite(n) || !Number.isFinite(esperado)) return false;
  return Math.abs(n - esperado) < 0.05;
}

/**
 * Confirma pagamento, ativa/renova o pacote e estende `valido_ate` em 1 mês civil.
 * Idempotente por `mp_gestores_ia_ultimo_aprovado_id` (checado dentro da RPC).
 */
export async function processarGestoresIaAvulsoPlanoPago(
  externalReference: string,
  mpPaymentId: string | null,
): Promise<boolean> {
  const parsed = parseGestoresIaAvulsoExternalReference(externalReference);
  if (!parsed || !mpPaymentId?.trim()) return false;

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token?.trim()) return false;

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payment = (await res.json()) as Record<string, unknown>;
  if (!res.ok || String(payment?.status ?? "").toLowerCase() !== "approved") return false;

  const extFromMp = String(payment?.external_reference ?? "").trim();
  if (extFromMp !== externalReference.trim()) return false;

  // Valor esperado é por assinante — desconto definido pelo admin (2026-10-17) muda o que
  // cada um paga de verdade, nunca a constante fixa sozinha.
  const { data: assinanteData } = await supabaseAdmin.rpc("fn_calculadora_assinante_por_user_id", {
    p_user_id: parsed.userId,
  });
  const assinanteRow = assinanteData as
    | { gestores_ia_desconto_tipo: string | null; gestores_ia_desconto_valor: number | null }
    | null;
  const tipoRaw = assinanteRow?.gestores_ia_desconto_tipo ?? null;
  const descontoTipo = isGestoresIaAvulsoDescontoTipo(tipoRaw) ? tipoRaw : null;
  const valorEsperado = calcularValorMensalGestoresIaAvulso(descontoTipo, assinanteRow?.gestores_ia_desconto_valor ?? null);

  if (!valorCompativel(payment?.transaction_amount, valorEsperado)) {
    console.warn("[gestoresIaAvulsoPix] valor MP incompatível com a parcela esperada do assinante.");
    return false;
  }

  const { data: rowData, error: fetchErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_gestores_ia_pix_get", {
    p_user_id: parsed.userId,
  });
  if (fetchErr) {
    console.error("[gestoresIaAvulsoPix] fn_..._pix_get:", fetchErr.message);
    return false;
  }

  const row = (Array.isArray(rowData) ? rowData[0] : rowData) as
    | { valido_ate: string | null; mp_gestores_ia_ultimo_aprovado_id: string | null }
    | null;

  if (row?.mp_gestores_ia_ultimo_aprovado_id && row.mp_gestores_ia_ultimo_aprovado_id === mpPaymentId) {
    return true;
  }

  const validoAteStr = row?.valido_ate ?? new Date(0).toISOString();
  const novoValido = computeCalendarCycleValidoAte(validoAteStr, Date.now(), 1).toISOString();

  const valorPago = valorLiquidoRecebidoMp(payment);
  const pagoEmRaw = payment.date_approved;
  const pagoEm =
    typeof pagoEmRaw === "string" && pagoEmRaw.trim() ? new Date(pagoEmRaw).toISOString() : new Date().toISOString();

  const { data: aplicou, error: confirmErr } = await supabaseAdmin.rpc(
    "fn_calculadora_assinante_gestores_ia_pix_confirmar",
    {
      p_user_id: parsed.userId,
      p_novo_valido_ate: novoValido,
      p_mp_payment_id: mpPaymentId,
      p_external_reference: externalReference.trim(),
      p_valor_pago: Number.isFinite(valorPago) ? valorPago : 0,
      p_pago_em: pagoEm,
    },
  );

  if (confirmErr) {
    console.error("[gestoresIaAvulsoPix] fn_..._pix_confirmar:", confirmErr.message);
    return false;
  }

  return aplicou !== false;
}
