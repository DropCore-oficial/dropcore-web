import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: unknown };

function makeChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.order = self;
  chain.limit = self;
  chain.update = self;
  chain.insert = self;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const submitSellerErpPedidoMock = vi.fn();
vi.mock("@/lib/erp/submitSellerErpPedido", () => ({
  submitSellerErpPedido: (...args: unknown[]) => submitSellerErpPedidoMock(...args),
}));

const obterPedidoVendaBlingMock = vi.fn();
vi.mock("@/lib/blingOrdersApi", () => ({
  obterPedidoVendaBling: (...args: unknown[]) => obterPedidoVendaBlingMock(...args),
}));

const getSellerBlingAccessTokenMock = vi.fn();
vi.mock("@/lib/sellerBlingIntegration", () => ({
  getSellerBlingAccessToken: (...args: unknown[]) => getSellerBlingAccessTokenMock(...args),
}));

import { processBlingPedidoImport } from "./sellerBlingPedidoImport";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SELLER_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  fromMock.mockReset();
  submitSellerErpPedidoMock.mockReset();
  obterPedidoVendaBlingMock.mockReset();
  getSellerBlingAccessTokenMock.mockReset();
});

describe("processBlingPedidoImport — evento de exclusão", () => {
  it("cancela pedido existente que ainda não foi postado", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "pedidos") {
        return makeChain({ data: { id: "pedido-1", status: "pendente_estoque" }, error: null });
      }
      throw new Error(`tabela inesperada: ${table}`);
    });

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 999,
      is_delete_event: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("cancelado");
    }
  });

  it("não mexe em pedido já postado (enviado)", async () => {
    fromMock.mockImplementation(() => makeChain({ data: { id: "pedido-1", status: "enviado" }, error: null }));

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 999,
      is_delete_event: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("skipped_nao_encontrado_para_cancelar");
    }
  });

  it("não encontra pedido pra cancelar", async () => {
    fromMock.mockImplementation(() => makeChain({ data: null, error: null }));

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 999,
      is_delete_event: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("skipped_nao_encontrado_para_cancelar");
    }
  });
});

describe("processBlingPedidoImport — importação", () => {
  it("retorna erro quando não há token de acesso válido", async () => {
    getSellerBlingAccessTokenMock.mockResolvedValue(null);

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 123,
    });

    expect(result.ok).toBe(false);
    expect(obterPedidoVendaBlingMock).not.toHaveBeenCalled();
  });

  it("pula pedido sem itens com SKU mapeável", async () => {
    getSellerBlingAccessTokenMock.mockResolvedValue("token-valido");
    obterPedidoVendaBlingMock.mockResolvedValue({
      id: 123,
      numero: "1001",
      itens: [{ codigo: "", quantidade: 1 }],
    });

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 123,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("skipped_sem_itens");
    }
    expect(submitSellerErpPedidoMock).not.toHaveBeenCalled();
  });

  it("importa pedido válido chamando submitSellerErpPedido com os campos mapeados", async () => {
    getSellerBlingAccessTokenMock.mockResolvedValue("token-valido");
    obterPedidoVendaBlingMock.mockResolvedValue({
      id: 123,
      numero: "1001",
      itens: [{ codigo: "SKU-001", quantidade: 2 }],
      contato: { nome: "Fulano de Tal", telefone: "11999999999" },
      transporte: {
        contato: { municipio: "São Paulo", uf: "SP" },
        volumes: [{ codigoRastreamento: "BR123456789BR", servico: "PAC" }],
      },
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "sellers") {
        return makeChain({
          data: { id: SELLER_ID, org_id: ORG_ID, fornecedor_id: "forn-1", plano: "pro" },
          error: null,
        });
      }
      throw new Error(`tabela inesperada: ${table}`);
    });
    submitSellerErpPedidoMock.mockResolvedValue({
      ok: true,
      pedido_id: "pedido-novo",
      valor_total: 100,
      status: "enviado",
      estoque_atual_por_sku: [],
    });

    const result = await processBlingPedidoImport({
      org_id: ORG_ID,
      seller_id: SELLER_ID,
      bling_pedido_id: 123,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "imported") {
      expect(result.pedido_id_dropcore).toBe("pedido-novo");
    } else {
      throw new Error(`resultado inesperado: ${JSON.stringify(result)}`);
    }
    expect(submitSellerErpPedidoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        referencia_externa: "bling:123",
        tracking_codigo: "BR123456789BR",
        items: [{ sku: "SKU-001", quantidade: 2 }],
        meta: expect.objectContaining({
          comprador_nome: "Fulano de Tal",
          comprador_cidade: "São Paulo",
          comprador_uf: "SP",
        }),
      }),
    );
  });
});
