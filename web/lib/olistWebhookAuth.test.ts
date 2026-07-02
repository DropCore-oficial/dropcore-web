import { describe, expect, it, vi } from "vitest";
import { isOlistLegacyWebhookSecretValid, olistWebhookRequiresIngestToken } from "@/lib/olistWebhookAuth";

describe("olistWebhookAuth", () => {
  it("rejeita legado sem OLIST_WEBHOOK_SECRET", () => {
    vi.stubEnv("OLIST_WEBHOOK_SECRET", "");
    const req = new Request("https://dropcore.com.br/api/webhooks/olist", { method: "POST" });
    expect(isOlistLegacyWebhookSecretValid(req)).toBe(false);
    expect(olistWebhookRequiresIngestToken()).toBe(true);
  });

  it("aceita secret na query quando configurado", () => {
    vi.stubEnv("OLIST_WEBHOOK_SECRET", "segredo-teste");
    const req = new Request("https://dropcore.com.br/api/webhooks/olist?secret=segredo-teste", {
      method: "POST",
    });
    expect(isOlistLegacyWebhookSecretValid(req)).toBe(true);
    expect(olistWebhookRequiresIngestToken()).toBe(false);
  });
});
