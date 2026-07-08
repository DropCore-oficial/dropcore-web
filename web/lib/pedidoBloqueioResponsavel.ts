/**
 * Um pedido "bloqueado" tem um motivo acionável só por um dos lados (seller ou
 * fornecedor). Mostrar o motivo completo pro lado errado é confuso — ex.: "ative a
 * cor no catálogo... upgrade pro Pro" não faz sentido nenhum pro fornecedor ler.
 */
export type PedidoBloqueioResponsavel = "seller" | "fornecedor";

/** Texto neutro pro lado que NÃO consegue agir nesse motivo. */
export function motivoBloqueioParaOutroLado(responsavel: PedidoBloqueioResponsavel | null | undefined): string {
  if (responsavel === "seller") {
    return "Pedido bloqueado — pendência de plano/catálogo a resolver pelo seller.";
  }
  return "Pedido bloqueado — pendência a resolver pelo fornecedor.";
}

/**
 * Ajusta o `motivo_bloqueio` a mostrar de acordo com quem está vendo: o responsável
 * vê o motivo completo (com instrução de como resolver); o outro lado vê um texto neutro.
 */
export function motivoBloqueioParaPortal(params: {
  portal: PedidoBloqueioResponsavel;
  responsavel: PedidoBloqueioResponsavel | null | undefined;
  motivoCompleto: string | null | undefined;
}): string | null {
  if (!params.motivoCompleto) return null;
  if (!params.responsavel || params.responsavel === params.portal) return params.motivoCompleto;
  return motivoBloqueioParaOutroLado(params.responsavel);
}
