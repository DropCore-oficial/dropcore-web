export type NotificationPortalContext = "admin" | "seller" | "fornecedor";

export type NotificationRow = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo?: string;
  lido?: boolean;
  criado_em?: string;
  metadata?: Record<string, unknown>;
};

/** Tipos permitidos por portal — evita misturar alerta de admin com seller/fornecedor. */
export const NOTIFICATION_TIPOS_POR_CONTEXTO: Record<NotificationPortalContext, string[]> = {
  admin: [
    "deposito_entrou",
    "mensalidade_inadimplentes_org",
    "mensalidade_vencendo",
    "mensalidade_paga_admin",
    "alteracao_produto_pendente",
  ],
  seller: [
    "deposito_aprovado",
    "estoque_baixo",
    "mensalidade_paga_seller",
    "mensalidade_vencida",
    "mensalidade_vencendo",
    "plano_upgrade_pro",
    "saldo_baixo",
    "pedido_novo",
    "pedido_bloqueado",
    "pedido_pendente_estoque",
    "erro_saldo",
  ],
  fornecedor: [
    "mensalidade_paga_fornecedor",
    "mensalidade_vencida",
    "mensalidade_vencendo",
    "estoque_baixo",
    "pedido_para_postar",
    "pedido_bloqueado",
    "pedido_pendente_estoque",
    "repasse_recebido",
    "alteracao_aprovada",
    "alteracao_rejeitada",
  ],
};

/** Resumo da org (sellers/fornecedores inadimplentes) — só painel admin. */
export function isNotificacaoResumoOrgInadimplencia(n: Pick<NotificationRow, "tipo" | "titulo" | "mensagem">): boolean {
  if (n.tipo === "mensalidade_inadimplentes_org") return true;
  if (n.titulo !== "Mensalidades vencidas") return false;
  const msg = (n.mensagem ?? "").toLowerCase();
  return (
    msg.includes("seller(s) inadimplente") ||
    msg.includes("fornecedor(es) inadimplente") ||
    msg.includes("seller(s) e ")
  );
}

export function filterNotificationsForContext<T extends NotificationRow>(
  items: T[],
  context: NotificationPortalContext,
): T[] {
  const tiposPermitidos = NOTIFICATION_TIPOS_POR_CONTEXTO[context];
  return items.filter((n) => {
    if (!n.tipo || !tiposPermitidos.includes(n.tipo)) return false;
    if ((context === "seller" || context === "fornecedor") && isNotificacaoResumoOrgInadimplencia(n)) {
      return false;
    }
    if (context === "seller" && n.tipo === "mensalidade_paga_admin") return false;
    if (context === "seller" && n.tipo === "mensalidade_paga_fornecedor") return false;
    if (context === "fornecedor" && n.tipo === "mensalidade_paga_seller") return false;
    if (context === "fornecedor" && (n.tipo === "deposito_aprovado" || n.tipo === "deposito_entrou")) {
      return false;
    }
    // Legado (tipo genérico antes da separação): só no portal da entidade em metadata
    if (n.tipo === "mensalidade_paga") {
      const ent = (n.metadata as { entidade_tipo?: string } | undefined)?.entidade_tipo;
      if (ent === "seller") return context === "seller";
      if (ent === "fornecedor") return context === "fornecedor";
      return false;
    }
    return true;
  });
}
