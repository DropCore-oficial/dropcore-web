/**
 * Gestores de IA em piloto restrito — só o seller Galileus (Galileus Comércio De Roupas
 * Ltda) tem acesso hoje; os demais não veem o menu nem conseguem chamar a API. Remover essa
 * restrição quando o Sr Stark decidir abrir pra todos os sellers.
 */
export const GESTORES_IA_SELLER_ID_PERMITIDO = "4e46e749-8103-4a71-9b70-195ba73cba14";

export function gestoresIaSellerPermitido(sellerId: string | null | undefined): boolean {
  return sellerId === GESTORES_IA_SELLER_ID_PERMITIDO;
}
