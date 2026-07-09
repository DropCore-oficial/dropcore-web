import { beforeEach, describe, expect, it, vi } from "vitest";

type ChainOpts = { maybeSingle?: unknown; awaited?: unknown };

function makeChain(opts: ChainOpts) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.order = self;
  chain.limit = self;
  chain.update = self;
  chain.insert = () => Promise.resolve(opts.awaited ?? { error: null });
  chain.maybeSingle = () => Promise.resolve(opts.maybeSingle);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(opts.awaited ?? { data: null, error: null }).then(resolve);
  return chain;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

const isInadimplenteMock = vi.fn();
vi.mock("@/lib/inadimplencia", () => ({
  isInadimplente: (...args: unknown[]) => isInadimplenteMock(...args),
}));

const assertSellerPodeVenderSkusMock = vi.fn();
vi.mock("@/lib/sellerSkuHabilitado", () => ({
  assertSellerPodeVenderSkus: (...args: unknown[]) => assertSellerPodeVenderSkusMock(...args),
}));

const debitarEstoquePedidoMock = vi.fn();
const reverterEstoquePedidoMock = vi.fn();
vi.mock("@/lib/order/estoquePedido", () => ({
  debitarEstoquePedido: (...args: unknown[]) => debitarEstoquePedidoMock(...args),
  reverterEstoquePedido: (...args: unknown[]) => reverterEstoquePedidoMock(...args),
}));

const executeBlockSaleMock = vi.fn();
vi.mock("@/lib/blockSale", () => ({
  executeBlockSale: (...args: unknown[]) => executeBlockSaleMock(...args),
}));

const notifySellerPedidoAtencaoMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifySellerPedidoAtencao", () => ({
  notifySellerPedidoAtencao: (...args: unknown[]) => notifySellerPedidoAtencaoMock(...args),
}));

const notifyFornecedorPedidoParaPostarMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifyFornecedorPedidoParaPostar", () => ({
  notifyFornecedorPedidoParaPostar: (...args: unknown[]) => notifyFornecedorPedidoParaPostarMock(...args),
}));

const notifyEstoqueBaixoMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/notifyEstoqueBaixo", () => ({
  notifyEstoqueBaixo: (...args: unknown[]) => notifyEstoqueBaixoMock(...args),
}));

const fireErpEstoqueWebhookMock = vi.fn();
vi.mock("@/lib/erpEstoqueOutbound", () => ({
  fireErpEstoqueWebhook: (...args: unknown[]) => fireErpEstoqueWebhookMock(...args),
}));

const dispararSyncEstoqueOlistFornecedorSkusMock = vi.fn();
vi.mock("@/lib/sellerOlistSyncEstoqueOnChange", () => ({
  dispararSyncEstoqueOlistFornecedorSkus: (...args: unknown[]) => dispararSyncEstoqueOlistFornecedorSkusMock(...args),
}));

vi.mock("@/lib/pedidoBloqueioResponsavel", () => ({
  motivoBloqueioParaPortal: () => "motivo",
}));

import { tryPromoteBloqueadoPedido } from "./submitSellerErpPedido";

const ORG_ID = "org-1";
const PEDIDO_ID = "pedido-1";
const SELLER_ID = "seller-1";
const FORNECEDOR_ID = "forn-1";
const SKU_ID = "sku-1";

const MOTIVO_SKU_NAO_HABILITADO = "Esta variação não está habilitada no seu plano; ative a cor no catálogo.";

const pedidoRow = {
  id: PEDIDO_ID,
  org_id: ORG_ID,
  seller_id: SELLER_ID,
  fornecedor_id: FORNECEDOR_ID,
  status: "bloqueado",
  referencia_externa: "olist:123",
  tracking_codigo: null,
  metodo_envio: null,
  motivo_bloqueio: MOTIVO_SKU_NAO_HABILITADO,
  motivo_bloqueio_responsavel: "seller",
};

const sellerRow = {
  id: SELLER_ID,
  org_id: ORG_ID,
  fornecedor_id: FORNECEDOR_ID,
  plano: "start",
  erp_estoque_webhook_url: null,
  erp_estoque_webhook_secret: null,
};

function itemRows(estoqueAtual: number) {
  return [
    {
      quantidade: 2,
      skus: {
        id: SKU_ID,
        sku: "DJU001009",
        estoque_atual: estoqueAtual,
        estoque_minimo: null,
        nome_produto: "Camisa",
        custo_base: 10,
        custo_dropcore: 5,
        expedicao_override_linha: null,
      },
    },
  ];
}

function mockFromDefault(estoqueAtual: number) {
  fromMock.mockImplementation((table: string) => {
    if (table === "pedidos") {
      return makeChain({ maybeSingle: { data: pedidoRow, error: null }, awaited: { error: null } });
    }
    if (table === "sellers") {
      return makeChain({ maybeSingle: { data: sellerRow, error: null } });
    }
    if (table === "pedido_itens") {
      return makeChain({ awaited: { data: itemRows(estoqueAtual), error: null } });
    }
    if (table === "pedido_eventos") {
      return makeChain({ awaited: { error: null } });
    }
    throw new Error(`tabela inesperada nesse teste: ${table}`);
  });
}

beforeEach(() => {
  fromMock.mockReset();
  isInadimplenteMock.mockReset().mockResolvedValue(false);
  assertSellerPodeVenderSkusMock.mockReset();
  debitarEstoquePedidoMock.mockReset();
  reverterEstoquePedidoMock.mockReset();
  executeBlockSaleMock.mockReset();
  notifySellerPedidoAtencaoMock.mockClear();
  notifyFornecedorPedidoParaPostarMock.mockClear();
  notifyEstoqueBaixoMock.mockClear();
  fireErpEstoqueWebhookMock.mockClear();
  dispararSyncEstoqueOlistFornecedorSkusMock.mockClear();
});

describe("tryPromoteBloqueadoPedido", () => {
  it("continua bloqueado quando o motivo original ainda se aplica", async () => {
    mockFromDefault(10);
    assertSellerPodeVenderSkusMock.mockResolvedValue({ ok: false, error: MOTIVO_SKU_NAO_HABILITADO });

    const result = await tryPromoteBloqueadoPedido({ org_id: ORG_ID, pedido_id: PEDIDO_ID });

    expect(result.ok).toBe(false);
    if (!result.ok && "outcome" in result) {
      expect(result.outcome).toBe("ainda_bloqueado");
    } else {
      throw new Error(`resultado inesperado: ${JSON.stringify(result)}`);
    }
    expect(debitarEstoquePedidoMock).not.toHaveBeenCalled();
    expect(executeBlockSaleMock).not.toHaveBeenCalled();
  });

  it("promove pra pendente_estoque quando o bloqueio caiu mas o estoque não é suficiente", async () => {
    mockFromDefault(1); // quantidade pedida é 2
    assertSellerPodeVenderSkusMock.mockResolvedValue({ ok: true });

    const result = await tryPromoteBloqueadoPedido({ org_id: ORG_ID, pedido_id: PEDIDO_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("pendente_estoque");
    }
    expect(debitarEstoquePedidoMock).not.toHaveBeenCalled();
    expect(notifyFornecedorPedidoParaPostarMock).toHaveBeenCalled();
    expect(notifySellerPedidoAtencaoMock).toHaveBeenCalled();
  });

  it("promove pra enviado quando tudo já está liberado", async () => {
    mockFromDefault(10);
    assertSellerPodeVenderSkusMock.mockResolvedValue({ ok: true });
    debitarEstoquePedidoMock.mockResolvedValue({ ok: true, debitos: [{ sku_id: SKU_ID, quantidade: 2 }] });
    executeBlockSaleMock.mockResolvedValue({
      ok: true,
      ledger_id: "ledger-1",
      valor_total: 30,
      status: "enviado",
    });

    const result = await tryPromoteBloqueadoPedido({ org_id: ORG_ID, pedido_id: PEDIDO_ID });

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "enviado") {
      expect(result.pedido_id).toBe(PEDIDO_ID);
      expect(result.valor_total).toBe(30);
    } else {
      throw new Error(`resultado inesperado: ${JSON.stringify(result)}`);
    }
    expect(debitarEstoquePedidoMock).toHaveBeenCalledTimes(1);
    expect(executeBlockSaleMock).toHaveBeenCalledTimes(1);
    expect(notifyFornecedorPedidoParaPostarMock).toHaveBeenCalled();
  });
});
