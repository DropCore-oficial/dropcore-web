import { describe, expect, it } from "vitest";
import {
  filterNotificationsForContext,
  isNotificacaoResumoOrgInadimplencia,
} from "./notificationContextFilter";

describe("isNotificacaoResumoOrgInadimplencia", () => {
  it("detecta tipo admin e legado mensalidade_vencida", () => {
    expect(
      isNotificacaoResumoOrgInadimplencia({
        tipo: "mensalidade_inadimplentes_org",
        titulo: "X",
        mensagem: "",
      }),
    ).toBe(true);
    expect(
      isNotificacaoResumoOrgInadimplencia({
        tipo: "mensalidade_vencida",
        titulo: "Mensalidades vencidas",
        mensagem: "1 seller(s) inadimplente(s). Verifique as mensalidades.",
      }),
    ).toBe(true);
  });

  it("não confunde mensalidade_vencida do próprio portal", () => {
    expect(
      isNotificacaoResumoOrgInadimplencia({
        tipo: "mensalidade_vencida",
        titulo: "Mensalidade vencida",
        mensagem: "Sua mensalidade de R$ 97,90 está vencida.",
      }),
    ).toBe(false);
  });
});

describe("filterNotificationsForContext", () => {
  const orgSeller = {
    id: "1",
    tipo: "mensalidade_inadimplentes_org",
    titulo: "Mensalidades vencidas",
    mensagem: "1 seller(s) inadimplente(s).",
  };
  const fornVencida = {
    id: "2",
    tipo: "mensalidade_vencida",
    titulo: "Mensalidade vencida",
    mensagem: "Sua mensalidade está vencida.",
  };
  const depositoAdmin = {
    id: "3",
    tipo: "deposito_entrou",
    titulo: "Novo depósito PIX",
    mensagem: "Depósito aprovado.",
  };
  const semTipo = { id: "4", titulo: "Legado", mensagem: "sem tipo" };

  it("fornecedor não vê resumo org nem depósito admin", () => {
    const out = filterNotificationsForContext(
      [orgSeller, fornVencida, depositoAdmin, semTipo],
      "fornecedor",
    );
    expect(out.map((n) => n.id)).toEqual(["2"]);
  });

  it("seller não vê resumo org nem mensalidade paga do fornecedor", () => {
    const out = filterNotificationsForContext(
      [
        orgSeller,
        { id: "5", tipo: "deposito_aprovado", titulo: "Depósito", mensagem: "" },
        { id: "6", tipo: "mensalidade_paga_admin", titulo: "Paga", mensagem: "" },
        { id: "7", tipo: "mensalidade_paga_fornecedor", titulo: "Paga forn", mensagem: "" },
        { id: "8", tipo: "mensalidade_paga_seller", titulo: "Paga sell", mensagem: "" },
      ],
      "seller",
    );
    expect(out.map((n) => n.id)).toEqual(["5", "8"]);
  });

  it("fornecedor não vê mensalidade paga do seller", () => {
    const out = filterNotificationsForContext(
      [
        { id: "9", tipo: "mensalidade_paga_seller", titulo: "Paga sell", mensagem: "" },
        { id: "10", tipo: "mensalidade_paga_fornecedor", titulo: "Paga forn", mensagem: "" },
      ],
      "fornecedor",
    );
    expect(out.map((n) => n.id)).toEqual(["10"]);
  });

  it("admin vê resumo org e depósito", () => {
    const out = filterNotificationsForContext([orgSeller, depositoAdmin, fornVencida], "admin");
    expect(out.map((n) => n.id)).toEqual(["1", "3"]);
  });

  it("rejeita tipo desconhecido e sem tipo", () => {
    const out = filterNotificationsForContext(
      [{ id: "7", tipo: "plano_upgrade_pro", titulo: "Pro", mensagem: "" }, semTipo],
      "fornecedor",
    );
    expect(out).toHaveLength(0);
  });

  it("seller aceita plano_upgrade_pro", () => {
    const out = filterNotificationsForContext(
      [{ id: "8", tipo: "plano_upgrade_pro", titulo: "Pro", mensagem: "" }],
      "seller",
    );
    expect(out).toHaveLength(1);
  });

  it("seller aceita notificações de pedido (novo, bloqueado, pendente_estoque, erro_saldo)", () => {
    const out = filterNotificationsForContext(
      [
        { id: "11", tipo: "pedido_novo", titulo: "Novo pedido recebido", mensagem: "" },
        { id: "12", tipo: "pedido_bloqueado", titulo: "Pedido bloqueado", mensagem: "" },
        { id: "13", tipo: "pedido_pendente_estoque", titulo: "Pedido aguardando estoque", mensagem: "" },
        { id: "14", tipo: "erro_saldo", titulo: "Erro de saldo", mensagem: "" },
      ],
      "seller",
    );
    expect(out.map((n) => n.id)).toEqual(["11", "12", "13", "14"]);
  });

  it("fornecedor aceita pedido_bloqueado e pedido_pendente_estoque", () => {
    const out = filterNotificationsForContext(
      [
        { id: "15", tipo: "pedido_bloqueado", titulo: "Pedido bloqueado", mensagem: "" },
        { id: "16", tipo: "pedido_pendente_estoque", titulo: "Pedido aguardando estoque", mensagem: "" },
      ],
      "fornecedor",
    );
    expect(out.map((n) => n.id)).toEqual(["15", "16"]);
  });
});
