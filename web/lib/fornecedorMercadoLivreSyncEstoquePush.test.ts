import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: unknown };

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const mlAtualizarEstoqueMock = vi.fn();
vi.mock("@/lib/mercadoLivreApiClient", () => ({
  mlAtualizarEstoque: (...args: unknown[]) => mlAtualizarEstoqueMock(...args),
}));

const getValidMercadoLivreAccessTokenFornecedorMock = vi.fn();
vi.mock("@/lib/mercadoLivreApiClientFornecedor", () => ({
  getValidMercadoLivreAccessTokenFornecedor: (...args: unknown[]) => getValidMercadoLivreAccessTokenFornecedorMock(...args),
}));

import { pushEstoqueToFornecedorMercadoLivre } from "@/lib/fornecedorMercadoLivreSyncEstoquePush";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const FORNECEDOR_ID = "22222222-2222-2222-2222-222222222222";
const CTX = { accessToken: "token-fake" };

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  mlAtualizarEstoqueMock.mockReset();
  getValidMercadoLivreAccessTokenFornecedorMock.mockReset();
});

describe("pushEstoqueToFornecedorMercadoLivre", () => {
  it("não faz nada se o fornecedor não tiver Mercado Livre conectado", async () => {
    getValidMercadoLivreAccessTokenFornecedorMock.mockResolvedValue(null);

    const result = await pushEstoqueToFornecedorMercadoLivre({
      orgId: ORG_ID,
      fornecedorId: FORNECEDOR_ID,
      skuCodes: ["ABC001"],
    });

    expect(result).toEqual({ conectado: false, itens_atualizados: 0, falhas: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(mlAtualizarEstoqueMock).not.toHaveBeenCalled();
  });

  it("não faz nada se nenhum SKU estiver mapeado a um anúncio", async () => {
    getValidMercadoLivreAccessTokenFornecedorMock.mockResolvedValue(CTX);
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await pushEstoqueToFornecedorMercadoLivre({
      orgId: ORG_ID,
      fornecedorId: FORNECEDOR_ID,
      skuCodes: ["ABC001"],
    });

    expect(result).toEqual({ conectado: true, itens_atualizados: 0, falhas: 0 });
    expect(mlAtualizarEstoqueMock).not.toHaveBeenCalled();
  });

  it("empurra o mesmo saldo pros 2 anúncios quando o mesmo SKU está republicado", async () => {
    getValidMercadoLivreAccessTokenFornecedorMock.mockResolvedValue(CTX);
    rpcMock.mockResolvedValue({
      data: [
        { sku: "ABC001", ml_item_id: "MLB1", ml_variation_id: 0 },
        { sku: "ABC001", ml_item_id: "MLB2", ml_variation_id: 0 },
      ],
      error: null,
    });
    mlAtualizarEstoqueMock.mockResolvedValue({ ok: true });

    const result = await pushEstoqueToFornecedorMercadoLivre({
      orgId: ORG_ID,
      fornecedorId: FORNECEDOR_ID,
      skuCodes: ["abc001"],
      saldoOverrides: new Map([["ABC001", 7]]),
    });

    expect(result).toEqual({ conectado: true, itens_atualizados: 2, falhas: 0 });
    expect(mlAtualizarEstoqueMock).toHaveBeenCalledTimes(2);
    expect(mlAtualizarEstoqueMock).toHaveBeenCalledWith("MLB1", [{ variationId: 0, availableQuantity: 7 }], CTX);
    expect(mlAtualizarEstoqueMock).toHaveBeenCalledWith("MLB2", [{ variationId: 0, availableQuantity: 7 }], CTX);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("isola falha de 1 anúncio sem travar os demais", async () => {
    getValidMercadoLivreAccessTokenFornecedorMock.mockResolvedValue(CTX);
    rpcMock.mockResolvedValue({
      data: [
        { sku: "ABC001", ml_item_id: "MLB1", ml_variation_id: 0 },
        { sku: "ABC002", ml_item_id: "MLB2", ml_variation_id: 0 },
      ],
      error: null,
    });
    mlAtualizarEstoqueMock.mockImplementation(async (itemId: string) =>
      itemId === "MLB1" ? { ok: false, erro: "falha simulada" } : { ok: true }
    );

    const result = await pushEstoqueToFornecedorMercadoLivre({
      orgId: ORG_ID,
      fornecedorId: FORNECEDOR_ID,
      skuCodes: ["ABC001", "ABC002"],
      saldoOverrides: new Map([
        ["ABC001", 3],
        ["ABC002", 9],
      ]),
    });

    expect(result).toEqual({ conectado: true, itens_atualizados: 1, falhas: 1 });
    expect(mlAtualizarEstoqueMock).toHaveBeenCalledTimes(2);
  });

  it("busca o saldo em skus quando não vem em saldoOverrides", async () => {
    getValidMercadoLivreAccessTokenFornecedorMock.mockResolvedValue(CTX);
    rpcMock.mockResolvedValue({
      data: [{ sku: "ABC001", ml_item_id: "MLB1", ml_variation_id: 0 }],
      error: null,
    });
    fromMock.mockReturnValue(
      makeChain({ data: [{ sku: "ABC001", estoque_atual: 10, estoque_reservado: 4 }], error: null })
    );
    mlAtualizarEstoqueMock.mockResolvedValue({ ok: true });

    const result = await pushEstoqueToFornecedorMercadoLivre({
      orgId: ORG_ID,
      fornecedorId: FORNECEDOR_ID,
      skuCodes: ["ABC001"],
    });

    expect(result).toEqual({ conectado: true, itens_atualizados: 1, falhas: 0 });
    expect(mlAtualizarEstoqueMock).toHaveBeenCalledWith("MLB1", [{ variationId: 0, availableQuantity: 6 }], CTX);
  });
});
