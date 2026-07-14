import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";

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

describe("notifySellerPedidoAtencao", () => {
  it("insere notificação de pedido bloqueado com o motivo como mensagem", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain("user-123");
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoAtencao({
      org_id: "org-1",
      seller_id: "seller-1",
      pedido_id: "pedido-1",
      tipo: "pedido_bloqueado",
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

  it("insere notificação de pedido pendente_estoque com título diferente", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain("user-456");
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoAtencao({
      org_id: "org-1",
      seller_id: "seller-2",
      pedido_id: "pedido-2",
      tipo: "pedido_pendente_estoque",
      motivo: "Estoque zerado no DropCore.",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: "Pedido aguardando estoque", tipo: "pedido_pendente_estoque" })
    );
  });

  it("insere notificação de erro_saldo com título específico", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain("user-789");
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoAtencao({
      org_id: "org-1",
      seller_id: "seller-3",
      pedido_id: "pedido-3",
      tipo: "erro_saldo",
      motivo: "Saldo insuficiente para este pedido.",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: "Erro de saldo", tipo: "erro_saldo" })
    );
  });

  it("insere notificação de pedido_novo com título específico", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain("user-321");
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoAtencao({
      org_id: "org-1",
      seller_id: "seller-4",
      pedido_id: "pedido-4",
      tipo: "pedido_novo",
      motivo: "Novo pedido de R$ 69,00 recebido.",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: "Novo pedido recebido", tipo: "pedido_novo" })
    );
  });

  it("não insere notificação quando o seller não tem user_id", async () => {
    const insertSpy = vi.fn();
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") return sellersChain(null);
      if (table === "notifications") return notificationsChain(insertSpy);
      throw new Error(`tabela inesperada: ${table}`);
    });

    await notifySellerPedidoAtencao({
      org_id: "org-1",
      seller_id: "seller-1",
      pedido_id: "pedido-1",
      tipo: "pedido_bloqueado",
      motivo: "Fornecedor inadimplente.",
    });

    expect(insertSpy).not.toHaveBeenCalled();
  });
});
