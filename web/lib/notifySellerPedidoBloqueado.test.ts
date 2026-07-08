import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { notifySellerPedidoBloqueado } from "@/lib/notifySellerPedidoBloqueado";

function sellersChain(userId: string | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: userId ? { user_id: userId } : null, error: null }),
      }),
    }),
  };
}

function notificationsChain(insertSpy: (row: unknown) => void) {
  return {
    insert: async (row: unknown) => {
      insertSpy(row);
      return { data: null, error: null };
    },
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("notifySellerPedidoBloqueado", () => {
  it("insere notificação pro user_id do seller com o motivo como mensagem", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain("user-123");
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoBloqueado({
      org_id: "org-1",
      seller_id: "seller-1",
      pedido_id: "pedido-1",
      motivo: "Esta variação não está habilitada no seu plano.",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        tipo: "pedido_bloqueado",
        titulo: "Pedido bloqueado",
        mensagem: "Esta variação não está habilitada no seu plano.",
        metadata: { pedido_id: "pedido-1" },
      })
    );
  });

  it("não insere notificação quando o seller não tem user_id", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain(null);
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoBloqueado({
      org_id: "org-1",
      seller_id: "seller-1",
      pedido_id: "pedido-1",
      motivo: "Fornecedor inadimplente.",
    });

    expect(insertSpy).not.toHaveBeenCalled();
  });
});
