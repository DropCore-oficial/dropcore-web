/** Alinhado ao fallback de `app/api/org/mensalidades/gerar/route.ts` e seed `financial_planos` (linhas Starter / Pro). */
export const VALOR_DEFAULT_MENSALIDADE_SELLER = 97.9;
/** Seed `financial_planos` (`Pro`); usado só quando a tabela não responde ou falta linha Pro. */
export const VALOR_DEFAULT_MENSALIDADE_SELLER_PRO = 147.9;

type AdminClient = typeof import("@/lib/supabaseAdmin").supabaseAdmin;

/**
 * Lê `financial_planos.valor_seller` por plano (chaves típicas: Starter, Pro, default — normalizadas em minúsculas).
 * Em falha ou tabela vazia, devolve defaults da tabela financeira (seller: R$ 97,90 starter · R$ 147,90 pro).
 */
export async function fetchMensalidadeSellerPorPlano(admin: AdminClient): Promise<{ starter: number; pro: number }> {
  const { data: planos, error } = await admin.from("financial_planos").select("plano, valor_seller");
  if (error || !planos?.length) {
    return { starter: VALOR_DEFAULT_MENSALIDADE_SELLER, pro: VALOR_DEFAULT_MENSALIDADE_SELLER_PRO };
  }
  const map = new Map(
    planos.map((p) => [String((p as { plano?: string }).plano ?? "").trim().toLowerCase(), Number((p as { valor_seller?: unknown }).valor_seller)])
  );
  const def = map.get("default");
  const starter = map.get("starter") ?? def ?? VALOR_DEFAULT_MENSALIDADE_SELLER;
  const pro = map.get("pro") ?? def ?? VALOR_DEFAULT_MENSALIDADE_SELLER_PRO;
  return {
    starter: Number.isFinite(starter) ? starter : VALOR_DEFAULT_MENSALIDADE_SELLER,
    pro: Number.isFinite(pro) ? pro : VALOR_DEFAULT_MENSALIDADE_SELLER_PRO,
  };
}
