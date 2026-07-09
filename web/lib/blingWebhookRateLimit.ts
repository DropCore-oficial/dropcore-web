/**
 * Rate limit best-effort para POST /api/webhooks/bling (anti-abuso em massa).
 * Em serverless cada instância tem o seu contador — não é um teto global no planeta,
 * mas segura rajadas e custo por Lambda. Espelha web/lib/olistWebhookRateLimit.ts,
 * só por IP (Bling não tem um token de ingest por seller como a Olist).
 */

const WINDOW_MS = 60_000;

type Bucket = { windowStart: number; count: number };

const bucketsIp = new Map<string, Bucket>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : fallback;
}

function maxPerWindowIp(): number {
  return parsePositiveInt(process.env.BLING_WEBHOOK_RL_IP_MAX, 200);
}

function pruneMap(map: Map<string, Bucket>, now: number) {
  if (map.size < 4000) return;
  for (const [k, b] of map) {
    if (now - b.windowStart > WINDOW_MS * 2) map.delete(k);
  }
  if (map.size > 8000) map.clear();
}

function tryConsume(map: Map<string, Bucket>, key: string, max: number, now: number): boolean {
  pruneMap(map, now);
  let b = map.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    map.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Primeiro IP em X-Forwarded-For (Vercel / proxies). */
export function getBlingWebhookClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const xr = req.headers.get("x-real-ip")?.trim();
  if (xr) return xr.slice(0, 128);
  return "unknown";
}

export type BlingWebhookRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Consome 1 slot no contador por IP. Chamar no início do handler. */
export function assertBlingWebhookRateLimit(req: Request): BlingWebhookRateLimitResult {
  const now = Date.now();
  const ip = getBlingWebhookClientIp(req);
  const ipKey = `ip:${ip}`;

  if (!tryConsume(bucketsIp, ipKey, maxPerWindowIp(), now)) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(WINDOW_MS / 1000)) };
  }

  return { ok: true };
}

/** Só para testes. */
export function resetBlingWebhookRateLimitForTests() {
  bucketsIp.clear();
}
