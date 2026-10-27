/**
 * Renovação da calculadora via PIX — mensal (R$14,99, recorrente) ou anual (R$149,90, PIX
 * único por ano, "2 meses grátis" — decisão 2026-10-27, desconto visível na tela, diferente
 * do padrão do pacote Gestores de IA). O ciclo fica codificado no próprio prefixo do
 * external_reference (não precisa de coluna nova pra saber qual foi pago).
 * Referência externa ≤ 64 caracteres (limite Mercado Pago): crcalc + UUID sem hífens (32 hex) + nonce (8 hex) = 46 chars.
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCalculadoraRenovacaoValorBrl, getCalculadoraRenovacaoAnualValorBrl } from "@/lib/calculadoraRenovacaoConfig";
import { computeCalendarCycleValidoAte } from "@/lib/calculadoraRenovacaoValidoAte";
import { valorLiquidoRecebidoMp } from "@/lib/mercadoPagoValorRecebido";

/** Prefixo único (não colide com UUID de mensalidade nem upgrade-pro / deposito). */
export const CALC_RENOV_EXT_PREFIX = "crcalc";
/** Prefixo do PIX anual — mesmo formato, só o prefixo muda. */
export const CALC_RENOV_ANUAL_EXT_PREFIX = "cranual";

export type CalculadoraRenovacaoCiclo = "mensal" | "anual";

function uuidCompact(userId: string): string {
  return userId.replace(/-/g, "").toLowerCase();
}

function uuidExpand(hex32: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(hex32)) return null;
  const h = hex32.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Gera external_reference único e válido no MP (alfanumérico, curto). */
export function buildCalculadoraRenovacaoExternalReference(userId: string): string {
  const compact = uuidCompact(userId);
  const nonce = randomBytes(4).toString("hex");
  return `${CALC_RENOV_EXT_PREFIX}${compact}${nonce}`;
}

/** Igual à mensal, só muda o prefixo — é isso que o processador usa pra saber que foi o PIX
 * anual na hora de confirmar o pagamento. */
export function buildCalculadoraRenovacaoAnualExternalReference(userId: string): string {
  const compact = uuidCompact(userId);
  const nonce = randomBytes(4).toString("hex");
  return `${CALC_RENOV_ANUAL_EXT_PREFIX}${compact}${nonce}`;
}

export function parseCalculadoraRenovacaoExternalReference(
  extRef: string,
): { userId: string; ciclo: CalculadoraRenovacaoCiclo } | null {
  const t = String(extRef ?? "").trim();

  for (const [prefix, ciclo] of [
    [CALC_RENOV_ANUAL_EXT_PREFIX, "anual"],
    [CALC_RENOV_EXT_PREFIX, "mensal"],
  ] as const) {
    const expectedLen = prefix.length + 32 + 8;
    if (t.startsWith(prefix) && t.length === expectedLen) {
      const payload = t.slice(prefix.length);
      if (!/^[0-9a-f]{40}$/i.test(payload)) return null;
      const uuidPart = payload.slice(0, 32);
      const userId = uuidExpand(uuidPart);
      return userId ? { userId, ciclo } : null;
    }
  }

  /** Legado (excedia 64 caracteres no MP — mantido só para referências antigas em voo, sempre mensal). */
  const legacy = "calc-renew::";
  if (t.startsWith(legacy)) {
    const rest = t.slice(legacy.length);
    const parts = rest.split("::");
    if (parts.length < 2) return null;
    const userId = parts[0]?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
    return { userId, ciclo: "mensal" };
  }
  return null;
}

function valorCompativel(valorMp: unknown, esperado: number): boolean {
  const n = typeof valorMp === "number" ? valorMp : parseFloat(String(valorMp ?? ""));
  if (!Number.isFinite(n) || !Number.isFinite(esperado)) return false;
  return Math.abs(n - esperado) < 0.05;
}

function valorRegistroRecebimentoMp(payment: Record<string, unknown>): number {
  return valorLiquidoRecebidoMp(payment);
}

/**
 * Confirma pagamento e estende valido_ate. Idempotente por mp_renovacao_ultimo_aprovado_id.
 */
export async function processarCalculadoraRenovacaoPaga(
  externalReference: string,
  mpPaymentId: string | null,
): Promise<boolean> {
  const parsed = parseCalculadoraRenovacaoExternalReference(externalReference);
  if (!parsed || !mpPaymentId?.trim()) return false;

  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token?.trim()) return false;

  const valorEsperado =
    parsed.ciclo === "anual" ? getCalculadoraRenovacaoAnualValorBrl() : getCalculadoraRenovacaoValorBrl();
  if (valorEsperado == null) {
    console.error(
      `[calculadoraRenovacao] ${parsed.ciclo === "anual" ? "CALCULADORA_RENOVACAO_ANUAL_VALOR" : "CALCULADORA_RENOVACAO_VALOR"} não configurado.`,
    );
    return false;
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payment = (await res.json()) as Record<string, unknown>;
  if (!res.ok || String(payment?.status ?? "").toLowerCase() !== "approved") return false;

  const extFromMp = String(payment?.external_reference ?? "").trim();
  if (extFromMp !== externalReference.trim()) return false;

  if (!valorCompativel(payment?.transaction_amount, valorEsperado)) {
    console.warn("[calculadoraRenovacao] Valor MP incompatível com CALCULADORA_RENOVACAO_VALOR.");
    return false;
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("id, user_id, valido_ate, ativo")
    .eq("user_id", parsed.userId)
    .maybeSingle();

  if (fetchErr) return false;

  const { data: planoRow } = row
    ? await supabaseAdmin
        .from("calculadora_assinante_plano_calculadora")
        .select("mp_renovacao_ultimo_aprovado_id")
        .eq("assinante_id", row.id)
        .maybeSingle()
    : { data: null };

  const now = Date.now();
  const ultimo = (planoRow as { mp_renovacao_ultimo_aprovado_id?: string | null } | null)?.mp_renovacao_ultimo_aprovado_id;
  if (ultimo && ultimo === mpPaymentId) return true;

  const validoAteStr = row ? String(row.valido_ate) : new Date(0).toISOString();
  const novoValido = computeCalendarCycleValidoAte(validoAteStr, now, parsed.ciclo === "anual" ? 12 : 1).toISOString();

  let assinanteId = row?.id as string | undefined;
  if (row) {
    const { error: upErr } = await supabaseAdmin
      .from("calculadora_assinantes")
      .update({ valido_ate: novoValido, ativo: true, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) {
      console.error("[calculadoraRenovacao] update:", upErr.message);
      return false;
    }
  } else {
    const { data: novaLinha, error: insErr } = await supabaseAdmin
      .from("calculadora_assinantes")
      .insert({ user_id: parsed.userId, valido_ate: novoValido, ativo: true })
      .select("id")
      .single();
    if (insErr) {
      console.error("[calculadoraRenovacao] insert:", insErr.message);
      return false;
    }
    assinanteId = novaLinha.id;
  }

  const { error: planoErr } = await supabaseAdmin
    .from("calculadora_assinante_plano_calculadora")
    .update({ mp_renovacao_ultimo_aprovado_id: mpPaymentId, mp_renovacao_pendente_id: null })
    .eq("assinante_id", assinanteId);
  if (planoErr) {
    console.error("[calculadoraRenovacao] update plano:", planoErr.message);
    return false;
  }

  const valorPago = valorRegistroRecebimentoMp(payment);
  const pagoEmRaw = payment.date_approved;
  const pagoEm =
    typeof pagoEmRaw === "string" && pagoEmRaw.trim()
      ? new Date(pagoEmRaw).toISOString()
      : new Date().toISOString();

  if (Number.isFinite(valorPago) && valorPago >= 0) {
    const { error: recErr } = await supabaseAdmin.from("calculadora_recebimentos").insert({
      user_id: parsed.userId,
      mp_payment_id: mpPaymentId.trim(),
      valor: valorPago,
      external_reference: externalReference.trim(),
      pago_em: pagoEm,
    });
    if (recErr) {
      if (recErr.code === "23505") {
        /* já registrado — idempotente */
      } else if (recErr.code === "42P01" || /does not exist/i.test(recErr.message ?? "")) {
        console.warn(
          "[calculadoraRenovacao] Tabela calculadora_recebimentos ausente. Rode web/scripts/create-calculadora-recebimentos.sql no Supabase.",
        );
      } else {
        console.error("[calculadoraRenovacao] calculadora_recebimentos:", recErr.message);
      }
    }
  }

  return true;
}
