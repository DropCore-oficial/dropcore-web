import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyMercadoPagoWebhookSignatureOpts = {
  signatureHeader: string | null;
  requestId: string | null;
  /** `data.id` da query string ou do corpo (payment/order id). */
  dataId: string | null;
  secret: string;
};

function parseXSignature(header: string): { ts: string; v1: string } | null {
  const parts = header.split(",").map((p) => p.trim());
  let ts = "";
  let v1 = "";
  for (const part of parts) {
    if (part.startsWith("ts=")) ts = part.slice(3).trim();
    if (part.startsWith("v1=")) v1 = part.slice(3).trim();
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

function buildMercadoPagoWebhookManifest(opts: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  const chunks: string[] = [];
  const id = opts.dataId?.trim();
  if (id) chunks.push(`id:${id.toLowerCase()};`);
  const rid = opts.requestId?.trim();
  if (rid) chunks.push(`request-id:${rid};`);
  chunks.push(`ts:${opts.ts};`);
  return chunks.join("");
}

/** Valida `x-signature` do Mercado Pago (HMAC-SHA256). Doc: developers.mercadopago.com → Webhooks. */
export function verifyMercadoPagoWebhookSignature(opts: VerifyMercadoPagoWebhookSignatureOpts): boolean {
  const secret = opts.secret.trim();
  if (!secret || !opts.signatureHeader?.trim()) return false;

  const parsed = parseXSignature(opts.signatureHeader.trim());
  if (!parsed) return false;

  const manifest = buildMercadoPagoWebhookManifest({
    dataId: opts.dataId,
    requestId: opts.requestId,
    ts: parsed.ts,
  });

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const received = parsed.v1;

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function resolveMercadoPagoWebhookDataId(req: Request, body: Record<string, unknown>): string | null {
  const url = new URL(req.url);
  const fromQuery =
    url.searchParams.get("data.id")?.trim() ||
    url.searchParams.get("id")?.trim() ||
    "";
  if (fromQuery) return fromQuery;

  const data = body.data;
  if (data && typeof data === "object" && data !== null) {
    const id = (data as { id?: unknown }).id;
    if (id != null && String(id).trim()) return String(id).trim();
  }
  return null;
}
