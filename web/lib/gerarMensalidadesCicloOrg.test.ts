import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { gerarMensalidadesParaOrgCiclo } from "@/lib/gerarMensalidadesCicloOrg";

type Row = Record<string, unknown>;

// Thenable mínimo: suporta .select()/.eq()/.ilike() encadeados e resolve ao ser `await`-ado,
// sem precisar simular o client do Supabase de verdade.
function thenable(data: unknown, error: unknown = null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    ilike: () => builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve({ data, error }),
  };
  return builder;
}

const PLANOS = [
  { plano: "Starter", valor_seller: 97.9, valor_fornecedor: 97.9 },
  { plano: "Pro", valor_seller: 197.9, valor_fornecedor: 97.9 },
  { plano: "default", valor_seller: 97.9, valor_fornecedor: 0 },
];

function setupMocks(opts: {
  sellers: Row[];
  fornecedores?: Row[];
  inadimplentes?: Row[];
  cicloAtual?: Row[];
  upsertSpy: (rows: Row[], options?: unknown) => void;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "financial_planos") return thenable(PLANOS);
    if (table === "sellers") return thenable(opts.sellers);
    if (table === "fornecedores") return thenable(opts.fornecedores ?? []);
    if (table === "financial_mensalidades") {
      return {
        select: () => {
          const filters: Record<string, unknown> = {};
          const selBuilder = {
            eq(key: string, value: unknown) {
              filters[key] = value;
              return selBuilder;
            },
            then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
              const data = filters.status === "inadimplente" ? opts.inadimplentes ?? [] : opts.cicloAtual ?? [];
              resolve({ data, error: null });
            },
          };
          return selBuilder;
        },
        upsert: (rows: Row[], options: unknown) => {
          opts.upsertSpy(rows, options);
          return { select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: `gen-${i}` })), error: null }) };
        },
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  });
}

function sellerBase(overrides: Row): Row {
  return {
    nome: "Loja",
    mensalidade_dia_vencimento: 1,
    trial_valido_ate: null,
    mensalidade_valor_travado: null,
    gestores_ia_addon_ativo: false,
    plano_ciclo: "mensal",
    plano_ciclo_carencia_fim: null,
    plano_desconto_tipo: null,
    plano_desconto_valor: null,
    plano_ciclo_valor_travado: null,
    plano_ciclo_compromisso_fim: null,
    ...overrides,
  };
}

const CICLO_FUTURO = "2099-01";

beforeEach(() => {
  fromMock.mockReset();
});

describe("gerarMensalidadesParaOrgCiclo — ciclo mensal (regressão)", () => {
  it("seller Starter sem desconto gera no valor de tabela, sem mudança de comportamento", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [sellerBase({ id: "seller-1", plano: "Starter" })],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-1", valor: 97.9 })],
      expect.anything()
    );
  });
});

describe("gerarMensalidadesParaOrgCiclo — carência do ciclo semestral/anual", () => {
  it("seller em carência (carencia_fim no futuro) não gera mensalidade no ciclo", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-2",
          plano: "Pro",
          plano_ciclo: "semestral",
          plano_ciclo_carencia_fim: "2099-06-30",
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(result.geradas).toBe(0);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("seller com carência já vencida (carencia_fim no passado) volta a gerar normal", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-3",
          plano: "Starter",
          plano_ciclo: "anual",
          plano_ciclo_carencia_fim: "2020-01-01",
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-3", valor: 97.9 })],
      expect.anything()
    );
  });
});

describe("gerarMensalidadesParaOrgCiclo — valor travado durante o compromisso", () => {
  it("dentro do compromisso (carência vencida, compromisso em aberto) usa o valor travado, ignorando a tabela viva", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-6",
          plano: "Pro",
          plano_ciclo: "anual",
          plano_ciclo_carencia_fim: "2020-01-01",
          plano_ciclo_compromisso_fim: "2099-12-31",
          plano_ciclo_valor_travado: 150,
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-6", valor: 150 })],
      expect.anything()
    );
  });

  it("compromisso já terminado volta a acompanhar a tabela ao vivo", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-7",
          plano: "Pro",
          plano_ciclo: "anual",
          plano_ciclo_carencia_fim: "2020-01-01",
          plano_ciclo_compromisso_fim: "2020-06-30",
          plano_ciclo_valor_travado: 150,
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-7", valor: 197.9 })],
      expect.anything()
    );
  });
});

describe("gerarMensalidadesParaOrgCiclo — desconto do admin", () => {
  it("aplica desconto percentual sobre o valor de tabela do plano", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-4",
          plano: "Pro",
          plano_desconto_tipo: "percentual",
          plano_desconto_valor: 15,
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-4", valor: 168.22 })],
      expect.anything()
    );
  });

  it("mensalidade_valor_travado (grandfathering) ignora ciclo e desconto", async () => {
    const upsertSpy = vi.fn();
    setupMocks({
      sellers: [
        sellerBase({
          id: "seller-5",
          plano: "Pro",
          mensalidade_valor_travado: 50,
          plano_ciclo: "anual",
          plano_ciclo_carencia_fim: "2020-01-01",
          plano_desconto_tipo: "percentual",
          plano_desconto_valor: 15,
        }),
      ],
      upsertSpy,
    });

    const result = await gerarMensalidadesParaOrgCiclo("org-1", CICLO_FUTURO);

    expect(result.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ entidade_id: "seller-5", valor: 50 })],
      expect.anything()
    );
  });
});
