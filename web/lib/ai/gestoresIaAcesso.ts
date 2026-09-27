/**
 * Gate de acesso aos Gestores de IA — até 2026-09-27 era piloto restrito só ao seller
 * Galileus (Galileus Comércio De Roupas Ltda), decisão do Sr Stark de abrir geral depois
 * de medir o custo real de rodada (ver memória de projeto "Gestores de IA — chat Elite").
 * Aberto pra qualquer seller agora; o gate de plano continua sendo `isPro()` nas rotas
 * (e, dentro do plano Pro, só o Ulisses está liberado — ver GESTORES_ID_DISPONIVEIS_NO_PRO
 * em gestorPerfis.ts).
 */
export function gestoresIaSellerPermitido(sellerId: string | null | undefined): boolean {
  return Boolean(sellerId);
}
