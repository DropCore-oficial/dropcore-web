import { describe, expect, it } from "vitest";
import {
  buildExpedicaoPadraoLinha,
  parseExpedicaoPadraoLinha,
  resolveExpedicaoEndereco,
} from "./expedicaoFornecedorFormat";

describe("expedicaoFornecedorFormat", () => {
  it("roundtrip build → parse", () => {
    const parts = {
      expedicao_cep: "01310100",
      expedicao_logradouro: "AV PAULISTA",
      expedicao_numero: "1000",
      expedicao_complemento: "SALA 2",
      expedicao_bairro: "BELA VISTA",
      expedicao_cidade: "SAO PAULO",
      expedicao_uf: "SP",
    };
    const linha = buildExpedicaoPadraoLinha(parts);
    expect(linha).toBeTruthy();
    const parsed = parseExpedicaoPadraoLinha(linha!);
    expect(parsed?.expedicao_cep).toBe("01310100");
    expect(parsed?.expedicao_logradouro).toBe("AV PAULISTA");
    expect(parsed?.expedicao_numero).toBe("1000");
    expect(parsed?.expedicao_complemento).toBe("SALA 2");
    expect(parsed?.expedicao_bairro).toBe("BELA VISTA");
    expect(parsed?.expedicao_cidade).toBe("SAO PAULO");
    expect(parsed?.expedicao_uf).toBe("SP");
  });

  it("parse linha legada com separador « - » (cadastro)", () => {
    const linha =
      "RUA MANDAGUARI, S/N - QUADRA 36 LOTE 10 SALA 07 - SETOR JARDIM MARISTA - CEP 75383-423 - TRINDADE/GO";
    const parsed = parseExpedicaoPadraoLinha(linha);
    expect(parsed?.expedicao_logradouro).toBe("RUA MANDAGUARI");
    expect(parsed?.expedicao_numero).toBe("S/N");
    expect(parsed?.expedicao_complemento).toBe("QUADRA 36 LOTE 10 SALA 07");
    expect(parsed?.expedicao_bairro).toBe("SETOR JARDIM MARISTA");
    expect(parsed?.expedicao_cep).toBe("75383423");
    expect(parsed?.expedicao_cidade).toBe("TRINDADE");
    expect(parsed?.expedicao_uf).toBe("GO");
  });

  it("resolveExpedicaoEndereco usa linha quando struct vazio", () => {
    const linha =
      "RUA DAS FLORES, 50 · GALPAO · CENTRO · CEP 30130010 · BELO HORIZONTE/MG";
    const r = resolveExpedicaoEndereco({
      expedicao_padrao_linha: linha,
      expedicao_cep: null,
      expedicao_logradouro: null,
      expedicao_numero: null,
      expedicao_complemento: null,
      expedicao_bairro: null,
      expedicao_cidade: null,
      expedicao_uf: null,
    });
    expect(r.expedicao_logradouro).toBe("RUA DAS FLORES");
    expect(r.expedicao_numero).toBe("50");
    expect(r.expedicao_complemento).toBe("GALPAO");
    expect(r.expedicao_bairro).toBe("CENTRO");
    expect(r.expedicao_cep).toBe("30130010");
    expect(r.expedicao_cidade).toBe("BELO HORIZONTE");
    expect(r.expedicao_uf).toBe("MG");
  });
});
