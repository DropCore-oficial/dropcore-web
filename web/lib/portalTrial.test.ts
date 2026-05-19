import { describe, expect, it } from "vitest";
import { clampPortalTrialDiasConvite, portalTrialEndIsoFromConviteDias } from "./portalTrial";

describe("portalTrial convite", () => {
  it("clamp: undefined usa default 7 (PORTAL_TRIAL_DAYS padrão)", () => {
    expect(clampPortalTrialDiasConvite(undefined)).toBe(7);
  });

  it("clamp: 0 mantém 0", () => {
    expect(clampPortalTrialDiasConvite(0)).toBe(0);
  });

  it("clamp: limita a 365", () => {
    expect(clampPortalTrialDiasConvite(999)).toBe(365);
  });

  it("portalTrialEndIsoFromConviteDias: 0 retorna null", () => {
    expect(portalTrialEndIsoFromConviteDias(0)).toBeNull();
  });

  it("portalTrialEndIsoFromConviteDias: positivo retorna ISO futuro", () => {
    const iso = portalTrialEndIsoFromConviteDias(1);
    expect(iso).toBeTruthy();
    expect(new Date(iso!).getTime()).toBeGreaterThan(Date.now());
  });
});
