/**
 * Nomes de exibição **só para o painel seller** (`/seller/*`, APIs `/api/seller/*`, copy em Admin > Sellers).
 * Não usar em org, fornecedor, dashboard interno da org nem platform stats — lá o plano da org é Starter/Pro genérico.
 *
 * Persistência seller: body `starter` | `pro`; coluna `sellers.plano` tipicamente `Starter` | `Pro`.
 */
export const SELLER_PLANO_NOME_START = "Start";
export const SELLER_PLANO_NOME_PRO = "Pro";

/** Texto padrão em formulários, erros e ajuda (“escolha Start ou Pro”). */
export const SELLER_PLANO_OPCOES_LEGIVEL = `${SELLER_PLANO_NOME_START} ou ${SELLER_PLANO_NOME_PRO}`;

/** Rótulo curto ao lado do nome no dashboard (badge). */
export function nomeExibicaoPlanoSeller(plano: string | null | undefined): string {
  const p = String(plano ?? "").trim().toLowerCase();
  if (p === "pro") return SELLER_PLANO_NOME_PRO;
  if (p === "starter") return SELLER_PLANO_NOME_START;
  return SELLER_PLANO_NOME_START;
}
