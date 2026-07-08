import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { liberarReservaEstoquePedido, reservarEstoquePedido } from "@/lib/order/estoqueReserva";

const SKU_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("reservarEstoquePedido", () => {
  it("chama rpc_reservar_estoque_sku por item com sku_id/quantidade", async () => {
    rpcMock.mockResolvedValue({
      data: [{ ok: true, error_code: null, error_message: null, sku_id: SKU_ID, sku: "ABC001", estoque_depois: 5 }],
      error: null,
    });

    const result = await reservarEstoquePedido([{ sku_id: SKU_ID, sku: "ABC001", quantidade: 2 }]);

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("rpc_reservar_estoque_sku", { p_sku_id: SKU_ID, p_quantidade: 2 });
  });

  it("rejeita sku_id inválido sem chamar a RPC", async () => {
    const result = await reservarEstoquePedido([{ sku_id: "nao-e-uuid", quantidade: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("ESTOQUE_INPUT_INVALIDO");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("mapeia SKU_NOT_FOUND retornado pela RPC", async () => {
    rpcMock.mockResolvedValue({
      data: [{ ok: false, error_code: "SKU_NOT_FOUND", error_message: "SKU não encontrado.", sku_id: null, sku: null, estoque_depois: null }],
      error: null,
    });

    const result = await reservarEstoquePedido([{ sku_id: SKU_ID, quantidade: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("SKU_NOT_FOUND");
  });
});

describe("liberarReservaEstoquePedido", () => {
  it("chama rpc_liberar_reserva_estoque_sku por item", async () => {
    rpcMock.mockResolvedValue({
      data: [{ ok: true, error_code: null, error_message: null, sku_id: SKU_ID, sku: "ABC001", estoque_depois: 0 }],
      error: null,
    });

    const result = await liberarReservaEstoquePedido([{ sku_id: SKU_ID, quantidade: 3 }]);

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("rpc_liberar_reserva_estoque_sku", { p_sku_id: SKU_ID, p_quantidade: 3 });
  });
});
