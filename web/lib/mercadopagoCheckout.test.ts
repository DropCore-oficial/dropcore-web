import { describe, expect, it } from "vitest";
import { resolveCheckoutPublicOrigin } from "@/lib/mercadopagoCheckout";
import { CANONICAL_SITE_ORIGIN } from "@/lib/siteUrl";

describe("resolveCheckoutPublicOrigin", () => {
  it("usa domínio canónico HTTPS quando o request é localhost", () => {
    const req = new Request("http://localhost:3000/api/fornecedor/mensalidades/x/cobranca-checkout");
    const origin = resolveCheckoutPublicOrigin(req);
    expect(origin.startsWith("https://")).toBe(true);
    expect(origin).toBe(CANONICAL_SITE_ORIGIN);
  });
});
