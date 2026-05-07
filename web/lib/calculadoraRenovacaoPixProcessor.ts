/**
 * Renovação da calculadora via PIX.
 * Referência externa ≤ 64 caracteres (limite Mercado Pago): crcalc + UUID sem hífens (32 hex) + nonce (8 hex) = 46 chars.
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCalculadoraRenovacaoValorBrl } from "@/lib/calculadoraRenovacaoConfig";
import { computeCalculadoraRenovacaoValidoAte } from "@/lib/calculadoraRenovacaoValidoAte";

/** Prefixo único (não colide com UUID de mensalidade nem upgrade-pro / deposito). */
export const CALC_RENOV_EXT_PREFIX = "crcalc";

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

export function parseCalculadoraRenovacaoExternalReference(extRef: string): { userId: string } | null {
  const t = String(extRef ?? "").trim();
  const prefix = CALC_RENOV_EXT_PREFIX;
  const expectedLen = prefix.length + 32 + 8;
  if (t.startsWith(prefix) && t.length === expectedLen) {
    const payload = t.slice(prefix.length);
    if (!/^[0-9a-f]{40}$/i.test(payload)) return null;
    const uuidPart = payload.slice(0, 32);
    const userId = uuidExpand(uuidPart);
    return userId ? { userId } : null;
  }
  /** Legado (excedia 64 caracteres no MP — mantido só para referências antigas em voo). */
  const legacy = "calc-renew::";
  if (t.startsWith(legacy)) {
    const rest = t.slice(legacy.length);
    const parts = rest.split("::");
    if (parts.length < 2) return null;
    const userId = parts[0]?.trim() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return null;
    return { userId };
  }
  return null;
}

function valorCompativel(valorMp: unknown, esperado: number): boolean {
  const n = typeof valorMp === "number" ? valorMp : parseFloat(String(valorMp ?? ""));
  if (!Number.isFinite(n) || !Number.isFinite(esperado)) return false;
  return Math.abs(n - esperado) < 0.05;
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

  const valorEsperado = getCalculadoraRenovacaoValorBrl();
  if (valorEsperado == null) {
    console.error("[calculadoraRenovacao] CALCULADORA_RENOVACAO_VALOR não configurado.");
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
    .select("id, user_id, valido_ate, ativo, mp_renovacao_ultimo_aprovado_id")
    .eq("user_id", parsed.userId)
    .eq("ativo", true)
    .maybeSingle();

  if (fetchErr || !row) return false;

  const ultimo = (row as { mp_renovacao_ultimo_aprovado_id?: string | null }).mp_renovacao_ultimo_aprovado_id;
  if (ultimo && ultimo === mpPaymentId) return true;

  const now = Date.now();
  const validoAteStr = String((row as { valido_ate: string }).valido_ate);
  const novoValido = computeCalculadoraRenovacaoValidoAte(validoAteStr, now).toISOString();

  const patch = {
    valido_ate: novoValido,
    ativo: true,
    mp_renovacao_ultimo_aprovado_id: mpPaymentId,
    mp_renovacao_pendente_id: null,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseAdmin.from("calculadora_assinantes").update(patch).eq("id", row.id);

  if (upErr) {
    console.error("[calculadoraRenovacao] update:", upErr.message);
    return false;
  }

  return true;
}
