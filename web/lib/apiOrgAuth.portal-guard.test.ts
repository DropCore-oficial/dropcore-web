import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Evita carregar `supabaseAdmin` (exige env no import). */
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/orgMeServer", () => ({
  resolveOrgMe: vi.fn(),
}));

import type { OrgMeSuccess } from "@/lib/orgMeServer";
import { getMe, requireAdmin } from "@/lib/apiOrgAuth";
import { resolveOrgMe } from "@/lib/orgMeServer";

function req(): Request {
  return new Request("https://example.test/api/x", {
    headers: { Authorization: "Bearer test-token" },
  });
}

function staffOwner(): OrgMeSuccess {
  return {
    ok: true,
    user_id: "user-staff",
    org_id: "org-1",
    fornecedor_id: null,
    seller_id: null,
    role_base: "owner",
    pode_ver_dinheiro: true,
    plano: "pro",
  };
}

describe("getMe — portal não acessa APIs de equipe (/api/org/*)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn<typeof console, "warn">>;

  beforeEach(() => {
    vi.mocked(resolveOrgMe).mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("bloqueia seller (seller_id) mesmo sem linha em org_members", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue({
      ok: true,
      user_id: "user-seller",
      org_id: null,
      fornecedor_id: null,
      seller_id: "seller-row-id",
      role_base: null,
      pode_ver_dinheiro: null,
      plano: "starter",
    });

    await expect(getMe(req())).rejects.toThrow("Sem permissão.");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0])) as {
      event: string;
      portal: { fornecedor: boolean; seller: boolean };
    };
    expect(payload.event).toBe("org_api.portal_blocked");
    expect(payload.portal).toEqual({ fornecedor: false, seller: true });
  });

  it("bloqueia fornecedor (fornecedor_id)", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue({
      ok: true,
      user_id: "user-forn",
      org_id: "org-1",
      fornecedor_id: "forn-1",
      seller_id: null,
      role_base: "admin",
      pode_ver_dinheiro: false,
      plano: "starter",
    });

    await expect(getMe(req())).rejects.toThrow("Sem permissão.");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0])) as {
      event: string;
      portal: { fornecedor: boolean; seller: boolean };
    };
    expect(payload.event).toBe("org_api.portal_blocked");
    expect(payload.portal).toEqual({ fornecedor: true, seller: false });
  });

  it("permite equipe (owner) sem vínculo de portal", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue(staffOwner());

    const me = await getMe(req());
    expect(me.org_id).toBe("org-1");
    expect(me.role_base).toBe("owner");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("requireAdmin — mesmo caminho das rotas sensíveis", () => {
  let warnSpy: ReturnType<typeof vi.spyOn<typeof console, "warn">>;

  beforeEach(() => {
    vi.mocked(resolveOrgMe).mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("seller não passa (bloqueado em getMe)", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue({
      ok: true,
      user_id: "user-seller",
      org_id: null,
      fornecedor_id: null,
      seller_id: "s1",
      role_base: null,
      pode_ver_dinheiro: null,
      plano: "starter",
    });

    await expect(requireAdmin(req())).rejects.toThrow("Sem permissão.");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warnSpy.mock.calls[0][0])).event).toBe("org_api.portal_blocked");
  });

  it("owner passa", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue(staffOwner());

    const me = await requireAdmin(req());
    expect(me.role_base).toBe("owner");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
