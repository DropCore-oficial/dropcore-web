/**
 * Rate limit best-effort para POST /api/webhooks/olist (anti-abuso em massa).
 * Em serverless cada instância tem o seu contador — não é um teto global no planeta,
 * mas segura rajadas e custo por Lambda.
 */

const WINDOW_MS = 60_000;

type Bucket = { windowStart: number; count: number };

const bucketsIp = new Map<string, Bucket>();
const bucketsW = new Map<string, Bucket>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : fallback;
}

function maxPerWindowIp(): number {
  return parsePositiveInt(process.env.OLIST_WEBHOOK_RL_IP_MAX, 200);
}

function maxPerWindowW(): number {
  return parsePositiveInt(process.env.OLIST_WEBHOOK_RL_W_MAX, 150);
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
export function getOlistWebhookClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const xr = req.headers.get("x-real-ip")?.trim();
  if (xr) return xr.slice(0, 128);
  return "unknown";
}

export type OlistWebhookRateLimitResult =
  | { ok: true }
  | { ok: false; reason: "ip" | "ingest"; retryAfterSec: number };

/**
 * Consome 1 slot nos contadores aplicáveis. Chamar no início do handler.
 * - Sempre: limite por IP.
 * - Se `ingestToken` não vazio: também limite por token `w` (por seller).
 */
export function assertOlistWebhookRateLimit(req: Request, ingestToken: string | null): OlistWebhookRateLimitResult {
  const now = Date.now();
  const ip = getOlistWebhookClientIp(req);
  const ipKey = `ip:${ip}`;

  if (!tryConsume(bucketsIp, ipKey, maxPerWindowIp(), now)) {
    return { ok: false, reason: "ip", retryAfterSec: Math.max(1, Math.ceil(WINDOW_MS / 1000)) };
  }

  const w = ingestToken?.trim();
  if (w) {
    const wKey = `w:${w.slice(0, 512)}`;
    if (!tryConsume(bucketsW, wKey, maxPerWindowW(), now)) {
      return { ok: false, reason: "ingest", retryAfterSec: Math.max(1, Math.ceil(WINDOW_MS / 1000)) };
    }
  }

  return { ok: true };
}

/** Só para testes. */
export function resetOlistWebhookRateLimitForTests() {
  bucketsIp.clear();
  bucketsW.clear();
}
