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

const dispararSyncEstoqueFornecedorSkusMock = vi.fn();
vi.mock("@/lib/fornecedorEstoqueSyncOnChange", () => ({
  dispararSyncEstoqueFornecedorSkus: (...args: unknown[]) => dispararSyncEstoqueFornecedorSkusMock(...args),
}));

vi.mock("@/lib/pedidoBloqueioResponsavel", () => ({
  motivoBloqueioParaPortal: () => "motivo",
}));

import { submitSellerErpPedido, tryPromoteBloqueadoPedido } from "./submitSellerErpPedido";

/** Chain genérico: qualquer método encadeado (eq/in/ilike/is/order/limit/or/gte/select)
 * devolve o mesmo objeto; resolve pra `{ data, error }` tanto em `await` direto quanto em
 * `.maybeSingle()`/`.single()`. Cobre select e insert().select().single(). */
function thenable(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const chain = () => obj;
  for (const m of ["select", "eq", "in", "ilike", "is", "order", "limit", "or", "gte", "insert", "update"]) {
    obj[m] = chain;
  }
  obj.maybeSingle = () => Promise.resolve({ data, error });
  obj.single = () => Promise.resolve({ data, error });
  obj.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return obj;
}

/** `skus` precisa resolver fornecedor_id DIFERENTE por SKU (pra simular carrinho com
 * produto de 2 fornecedores do CD) — a chain genérica acima não capta o valor passado
 * pro `.ilike("sku", ...)`, então esse mock dedicado guarda o último valor visto. */
function skusTableMock(bySkuCode: Record<string, Record<string, unknown>>) {
  return {
    select: () => {
      let skuArg = "";
      const obj: Record<string, unknown> = {};
      obj.eq = () => obj;
      obj.in = () => obj;
      obj.ilike = (_col: string, val: string) => {
        skuArg = val;
        return obj;
      };
      obj.maybeSingle = () => Promise.resolve({ data: bySkuCode[skuArg.toUpperCase()] ?? null, error: null });
      return obj;
    },
  };
}

const ORG_ID = "org-1";
const PEDIDO_ID = "pedido-1";
const SELLER_ID = "seller-1";
const FORNECEDOR_ID = "forn-1";
const SKU_ID = "sku-1";

const pedidoRow = {
  id: PEDIDO_ID,
  org_id: ORG_ID,
  seller_id: SELLER_ID,
  fornecedor_id: FORNECEDOR_ID,
  status: "bloqueado",
  referencia_externa: "olist:123",
  tracking_codigo: null,
  metodo_envio: null,
  motivo_bloqueio: "Saldo insuficiente.",
  motivo_bloqueio_responsavel: "seller",
};

const sellerRow = {
  id: SELLER_ID,
  org_id: ORG_ID,
  fornecedor_id: FORNECEDOR_ID,
  plano: "start",
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
  debitarEstoquePedidoMock.mockReset();
  reverterEstoquePedidoMock.mockReset();
  executeBlockSaleMock.mockReset();
  notifySellerPedidoAtencaoMock.mockClear();
  notifyFornecedorPedidoParaPostarMock.mockClear();
  notifyEstoqueBaixoMock.mockClear();
  dispararSyncEstoqueFornecedorSkusMock.mockClear();
});

describe("tryPromoteBloqueadoPedido", () => {
  it("promove pra pendente_estoque quando o bloqueio caiu mas o estoque não é suficiente", async () => {
    mockFromDefault(1); // quantidade pedida é 2

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

describe("submitSellerErpPedido — seller do CD sem avulso (fornecedor_id null)", () => {
  const SELLER_CD_SEM_AVULSO = { id: "seller-cd-1", fornecedor_id: null, plano: "start" };
  const FORN_DJULIOS = "forn-djulios";
  const FORN_CONSENSO = "forn-consenso";

  const skuDjulios = {
    id: "sku-djulios-1",
    sku: "DJU001000",
    nome_produto: "Vestido",
    estoque_atual: 10,
    estoque_minimo: null,
    custo_base: 50,
    custo_dropcore: 20,
    expedicao_override_linha: null,
    fornecedor_id: FORN_DJULIOS,
  };
  const skuConsenso = {
    ...skuDjulios,
    id: "sku-consenso-1",
    sku: "CON001000",
    fornecedor_id: FORN_CONSENSO,
  };

  function vinculosCdAtivos() {
    return thenable([{ fornecedor_id: FORN_DJULIOS }, { fornecedor_id: FORN_CONSENSO }]);
  }

  it("resolve fornecedor via vínculo do CD (não falha mais com FORNECEDOR_NOT_LINKED) e completa a venda", async () => {
    const pedidoInserido = { id: "pedido-cd-1", valor_total: 70, criado_em: "2026-11-23T00:00:00Z" };
    fromMock.mockImplementation((tableName: string) => {
      if (tableName === "seller_fornecedor_vinculos") return vinculosCdAtivos();
      if (tableName === "skus") return skusTableMock({ DJU001000: skuDjulios });
      if (tableName === "orgs") return thenable({ plano: "pro" });
      if (tableName === "pedidos") return thenable(pedidoInserido);
      if (tableName === "pedido_itens") return thenable(null);
      if (tableName === "pedido_eventos") return thenable(null);
      throw new Error(`tabela inesperada nesse teste: ${tableName}`);
    });
    isInadimplenteMock.mockResolvedValue(false);
    debitarEstoquePedidoMock.mockResolvedValue({ ok: true, debitos: [{ sku_id: skuDjulios.id, quantidade: 1 }] });
    executeBlockSaleMock.mockResolvedValue({
      ok: true,
      ledger_id: "ledger-cd-1",
      valor_total: 70,
      status: "enviado",
      ciclo_repasse: null,
    });

    const result = await submitSellerErpPedido({
      org_id: ORG_ID,
      seller: SELLER_CD_SEM_AVULSO,
      referencia_externa: null,
      items: [{ sku: "DJU001000", quantidade: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pedido_id).toBe("pedido-cd-1");
      expect(result.status).toBe("enviado");
    } else {
      throw new Error(`resultado inesperado: ${JSON.stringify(result)}`);
    }
    expect(executeBlockSaleMock).toHaveBeenCalledWith(
      expect.objectContaining({ fornecedor_id: FORN_DJULIOS, valor_fornecedor: 50, valor_dropcore: 20 })
    );
  });

  it("pedido com produto de 2 fornecedores do CD ao mesmo tempo é bloqueado (FORNECEDOR_CD_MISTO), não cobra errado", async () => {
    const pedidoPlaceholder = { id: "pedido-cd-misto-1", valor_total: 140 };
    fromMock.mockImplementation((tableName: string) => {
      if (tableName === "seller_fornecedor_vinculos") return vinculosCdAtivos();
      if (tableName === "skus") return skusTableMock({ DJU001000: skuDjulios, CON001000: skuConsenso });
      if (tableName === "pedidos") return thenable(pedidoPlaceholder);
      if (tableName === "pedido_itens") return thenable(null);
      if (tableName === "pedido_eventos") return thenable(null);
      throw new Error(`tabela inesperada nesse teste: ${tableName}`);
    });

    const result = await submitSellerErpPedido({
      org_id: ORG_ID,
      seller: SELLER_CD_SEM_AVULSO,
      referencia_externa: null,
      items: [
        { sku: "DJU001000", quantidade: 1 },
        { sku: "CON001000", quantidade: 1 },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("bloqueado");
    } else {
      throw new Error(`resultado inesperado: ${JSON.stringify(result)}`);
    }
    // Trava ANTES de mexer em dinheiro — nunca gera ledger/estoque pro carrinho misto.
    expect(executeBlockSaleMock).not.toHaveBeenCalled();
    expect(debitarEstoquePedidoMock).not.toHaveBeenCalled();
  });
});
