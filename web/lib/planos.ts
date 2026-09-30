/**
 * Helpers para planos da **organização** (chave BD `starter` | `pro`).
 * Desde 2026-09-30 Start e Pro têm catálogo ilimitado (o limite de 15 pares produto+cor do
 * Start foi removido — ver docs/SCHEMA.md, reprecificação Pro + add-on Gestores de IA).
 */

export type PlanoOrg = "starter" | "pro";

export function isPro(org: { plano?: string | null } | null): boolean {
  return String(org?.plano || "").toLowerCase() === "pro";
}

/** Add-on "Gestores de IA" (Diogo/Andrey/Amanda + futuros gestores) ativo pro seller —
 * independe do plano (Start ou Pro). Ulisses não depende disso, ver `isGestorUlissesLiberado`. */
export function temAddonGestoresIaAtivo(seller: { gestores_ia_addon_ativo?: boolean | null } | null): boolean {
  return seller?.gestores_ia_addon_ativo === true;
}

/** Ulisses (Ads, Preço & Promoção) é o único gestor liberado de graça só por ser Pro — os
 * demais (Diogo/Andrey/Amanda) exigem o add-on Gestores de IA em qualquer plano. */
export function isGestorUlissesLiberado(seller: { plano?: string | null; gestores_ia_addon_ativo?: boolean | null } | null): boolean {
  return isPro({ plano: seller?.plano }) || temAddonGestoresIaAtivo(seller);
}

/** SKUs com este prefixo (ex.: linha DJU999) nunca entraram no limite antigo de pares produto+cor. */
export const PREFIXO_SKU_SISTEMA = "DJU999";

/**
 * Retorna quantos pares (produto+cor) a org pode ter. Sempre ilimitado (`null`) hoje —
 * mantido como função (em vez de remover as chamadas) pra não precisar reescrever
 * `assertPodeAtivarMaisSkus` se algum limite por plano voltar no futuro.
 */
export function produtoCorMaxPorPlano(_plano: string | null): number | null {
  return null;
}

function toComboKey(nome: string | null | undefined, cor: string | null | undefined): string {
  return `${String(nome ?? "").trim()}::${String(cor ?? "").trim()}`;
}

export interface AssertPodeAtivarMaisSkusResult {
  ok: boolean;
  currentCount: number;
  limit: number | null;
  error?: string;
}

export type NovoItemProdutoCor = { nome_produto?: string | null; cor?: string | null };

/**
 * Verifica se a org pode adicionar novos pares (produto+cor).
 * Para Pro: sempre ok. Para Starter: ok se currentCount + novos únicos <= 15.
 * Cor/tamanho null ou vazio tratados como um único valor.
 */
export async function assertPodeAtivarMaisSkus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  orgPlano: string | null,
  newItems: NovoItemProdutoCor[]
): Promise<AssertPodeAtivarMaisSkusResult> {
  const limit = produtoCorMaxPorPlano(orgPlano);
  if (limit === null) {
    return { ok: true, currentCount: 0, limit: null };
  }

  const { data: existingRows, error } = await supabase
    .from("skus")
    .select("nome_produto, cor")
    .eq("org_id", orgId)
    .ilike("status", "ativo")
    .not("sku", "ilike", `${PREFIXO_SKU_SISTEMA}%`);

  if (error) {
    return { ok: false, currentCount: 0, limit, error: String(error) };
  }

  const existingCombos = new Set(
    (existingRows ?? []).map((r: { nome_produto?: string | null; cor?: string | null }) =>
      toComboKey(r.nome_produto, r.cor)
    )
  );
  const currentCount = existingCombos.size;

  const newCombos = new Set(
    newItems.map((it) => toComboKey(it.nome_produto, it.cor))
  );
  const adds = [...newCombos].filter((k) => !existingCombos.has(k)).length;

  if (currentCount + adds > limit) {
    return {
      ok: false,
      currentCount,
      limit,
      error: `Limite de ${limit} produtos (produto+cor) do plano Starter atingido. Atualmente você tem ${currentCount}. Faça upgrade para Pro para ilimitados.`,
    };
  }

  return { ok: true, currentCount, limit };
}
