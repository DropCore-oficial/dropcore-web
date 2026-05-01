import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.mocked(resolveOrgMe).mockReset();
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
  });

  it("permite equipe (owner) sem vínculo de portal", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue(staffOwner());

    const me = await getMe(req());
    expect(me.org_id).toBe("org-1");
    expect(me.role_base).toBe("owner");
  });
});

describe("requireAdmin — mesmo caminho das rotas sensíveis", () => {
  beforeEach(() => {
    vi.mocked(resolveOrgMe).mockReset();
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
  });

  it("owner passa", async () => {
    vi.mocked(resolveOrgMe).mockResolvedValue(staffOwner());

    const me = await requireAdmin(req());
    expect(me.role_base).toBe("owner");
  });
});
