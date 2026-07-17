import { describe, expect, it } from "vitest";
import {
  isCodigoSituacaoCancelado,
  isCodigoSituacaoEmAberto,
  isSituacaoTextoCancelada,
  isSituacaoTextoEmAberto,
  shouldImportSituacaoText,
  shouldSkipSituacaoTextOnPesquisa,
} from "@/lib/olistPedidoImportPolicy";

describe("isSituacaoTextoEmAberto", () => {
  it("reconhece 'em aberto' (com variações de caixa/espaço)", () => {
    expect(isSituacaoTextoEmAberto("Em Aberto")).toBe(true);
    expect(isSituacaoTextoEmAberto("  em aberto  ")).toBe(true);
  });

  it("reconhece 'dados incompletos' — mesmo caso (Shopee mascara comprador até pagar boleto)", () => {
    expect(isSituacaoTextoEmAberto("Dados incompletos")).toBe(true);
  });

  it("não reconhece outras situações", () => {
    expect(isSituacaoTextoEmAberto("Aprovado")).toBe(false);
    expect(isSituacaoTextoEmAberto("Cancelado")).toBe(false);
    expect(isSituacaoTextoEmAberto(null)).toBe(false);
  });
});

describe("isSituacaoTextoCancelada", () => {
  it("reconhece 'cancelado', inclusive com sufixo entre parênteses", () => {
    expect(isSituacaoTextoCancelada("Cancelado")).toBe(true);
    expect(isSituacaoTextoCancelada("Cancelado (estoque)")).toBe(true);
  });

  it("não reconhece outras situações", () => {
    expect(isSituacaoTextoCancelada("Em aberto")).toBe(false);
    expect(isSituacaoTextoCancelada("Aprovado")).toBe(false);
  });
});

describe("isCodigoSituacaoEmAberto / isCodigoSituacaoCancelado", () => {
  it("comparam o código sem diferenciar caixa", () => {
    expect(isCodigoSituacaoEmAberto("Aberto")).toBe(true);
    expect(isCodigoSituacaoEmAberto("aprovado")).toBe(false);
    expect(isCodigoSituacaoCancelado("CANCELADO")).toBe(true);
    expect(isCodigoSituacaoCancelado("aberto")).toBe(false);
  });
});

describe("shouldSkipSituacaoTextOnPesquisa", () => {
  it("não pula 'em aberto' nem 'dados incompletos' — cron precisa buscar o detalhe para reservar estoque", () => {
    expect(shouldSkipSituacaoTextOnPesquisa("Em aberto")).toBe(false);
    expect(shouldSkipSituacaoTextOnPesquisa("Dados incompletos")).toBe(false);
  });

  it("continua pulando cancelado", () => {
    expect(shouldSkipSituacaoTextOnPesquisa("Cancelado")).toBe(true);
  });
});

describe("shouldImportSituacaoText", () => {
  it("'em aberto' e 'dados incompletos' não são importados como venda (viram reserva, não pedido)", () => {
    expect(shouldImportSituacaoText("Em aberto")).toBe(false);
    expect(shouldImportSituacaoText("Dados incompletos")).toBe(false);
  });

  it("situações aprovadas continuam importando normalmente", () => {
    expect(shouldImportSituacaoText("Aprovado")).toBe(true);
    expect(shouldImportSituacaoText("Faturado (atendido)")).toBe(true);
  });
});
