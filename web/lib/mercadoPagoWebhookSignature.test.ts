import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoWebhookSignature } from "@/lib/mercadoPagoWebhookSignature";

describe("verifyMercadoPagoWebhookSignature", () => {
  it("valida assinatura HMAC conforme manifest MP", () => {
    const secret = "mp-webhook-secret-test";
    const dataId = "12345";
    const requestId = "req-abc";
    const ts = "1704908010";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: `ts=${ts},v1=${v1}`,
        requestId,
        dataId,
        secret,
      }),
    ).toBe(true);
  });

  it("rejeita assinatura incorreta", () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: "ts=1,v1=deadbeef",
        requestId: "x",
        dataId: "1",
        secret: "secret",
      }),
    ).toBe(false);
  });
});
