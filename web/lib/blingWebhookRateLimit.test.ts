import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { assertBlingWebhookRateLimit, resetBlingWebhookRateLimitForTests } from "./blingWebhookRateLimit";

describe("assertBlingWebhookRateLimit", () => {
  beforeEach(() => {
    resetBlingWebhookRateLimitForTests();
    vi.stubEnv("BLING_WEBHOOK_RL_IP_MAX", "3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bloqueia após exceder limite por IP", () => {
    const req = new Request("https://exemplo.com/api/webhooks/bling", {
      headers: { "x-forwarded-for": "203.0.113.50" },
    });
    expect(assertBlingWebhookRateLimit(req).ok).toBe(true);
    expect(assertBlingWebhookRateLimit(req).ok).toBe(true);
    expect(assertBlingWebhookRateLimit(req).ok).toBe(true);
    const last = assertBlingWebhookRateLimit(req);
    expect(last.ok).toBe(false);
  });

  it("IPs diferentes têm contadores independentes", () => {
    const reqA = new Request("https://exemplo.com/api/webhooks/bling", {
      headers: { "x-forwarded-for": "198.51.100.2" },
    });
    const reqB = new Request("https://exemplo.com/api/webhooks/bling", {
      headers: { "x-forwarded-for": "198.51.100.3" },
    });
    expect(assertBlingWebhookRateLimit(reqA).ok).toBe(true);
    expect(assertBlingWebhookRateLimit(reqA).ok).toBe(true);
    expect(assertBlingWebhookRateLimit(reqA).ok).toBe(true);
    expect(assertBlingWebhookRateLimit(reqA).ok).toBe(false);
    expect(assertBlingWebhookRateLimit(reqB).ok).toBe(true);
  });
});
