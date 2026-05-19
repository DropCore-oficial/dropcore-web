import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { assertOlistWebhookRateLimit, resetOlistWebhookRateLimitForTests } from "./olistWebhookRateLimit";

describe("assertOlistWebhookRateLimit", () => {
  beforeEach(() => {
    resetOlistWebhookRateLimitForTests();
    vi.stubEnv("OLIST_WEBHOOK_RL_IP_MAX", "3");
    vi.stubEnv("OLIST_WEBHOOK_RL_W_MAX", "2");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bloqueia após exceder limite por IP", () => {
    const req = new Request("https://exemplo.com/api/webhooks/olist", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    });
    expect(assertOlistWebhookRateLimit(req, null).ok).toBe(true);
    expect(assertOlistWebhookRateLimit(req, null).ok).toBe(true);
    expect(assertOlistWebhookRateLimit(req, null).ok).toBe(true);
    const last = assertOlistWebhookRateLimit(req, null);
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toBe("ip");
  });

  it("aplica segundo limite quando há token w", () => {
    const req = new Request("https://exemplo.com/api/webhooks/olist?w=abc", {
      headers: { "x-forwarded-for": "198.51.100.2" },
    });
    const token = "tok-test-xyz";
    expect(assertOlistWebhookRateLimit(req, token).ok).toBe(true);
    expect(assertOlistWebhookRateLimit(req, token).ok).toBe(true);
    const last = assertOlistWebhookRateLimit(req, token);
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.reason).toBe("ingest");
  });
});
