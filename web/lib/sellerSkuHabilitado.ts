/**
 * Seller Starter: até 15 SKUs escolhidos em seller_skus_habilitados para concretizar venda.
 * Seller Pro: sem essa lista. SKUs com prefixo PREFIXO_SKU_SISTEMA não precisam estar na lista.
 */
import { PREFIXO_SKU_SISTEMA } from "@/lib/planos";

export const MSG_SKU_NAO_HABILITADO_PLANO_STARTER =
  "SKU não habilitado no seu plano; ative no catálogo até 15. Ou faça upgrade para o plano Pro e libere mais limites.";

export const MSG_STARTER_PEDIDO_SEM_SKU =
  "No plano Starter é obrigatório vincular o pedido a um SKU (catálogo habilitado). Ou faça upgrade para o plano Pro e libere mais limites.";

const MAX_SKUS_HABILITADOS_STARTER = 15;

export function isSellerPlanoPro(plano: string | null | undefined): boolean {
  return String(plano ?? "").trim().toLowerCase() === "pro";
}

/** Se false, o SKU não conta no limite de 15 habilitados e não exige linha em seller_skus_habilitados para vender (Starter). */
export function skuContaLimiteHabilitacaoSeller(codigoSku: string | null | undefined): boolean {
  const s = String(codigoSku ?? "").trim().toUpperCase();
  return !s.startsWith(PREFIXO_SKU_SISTEMA.toUpperCase());
}

export async function countHabilitadosQueContamNoLimite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sellerId: string
): Promise<{ count: number; error?: string }> {
  const { data, error } = await supabase
    .from("seller_skus_habilitados")
    .select("sku_id, skus(sku)")
    .eq("seller_id", sellerId);

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { count: 0, error: "Tabela seller_skus_habilitados inexistente. Execute web/scripts/create-seller-skus-habilitados.sql." };
    }
    return { count: 0, error: msg };
  }

  let count = 0;
  for (const row of data ?? []) {
    const code = String((row as { skus?: { sku?: string | null } | null }).skus?.sku ?? "");
    if (skuContaLimiteHabilitacaoSeller(code)) count++;
  }
  return { count };
}

export type SkuRefParaVenda = { id: string; sku: string };

export async function assertSellerPodeVenderSkus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { sellerId: string; sellerPlano: string | null | undefined; skus: SkuRefParaVenda[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isSellerPlanoPro(params.sellerPlano)) return { ok: true };

  const unique = new Map<string, string>();
  for (const s of params.skus) {
    if (s?.id) unique.set(s.id, s.sku);
  }
  const entries = [...unique.entries()].filter(([id]) => id);

  const precisaCheck: { id: string; sku: string }[] = [];
  for (const [id, sku] of entries) {
    if (skuContaLimiteHabilitacaoSeller(sku)) precisaCheck.push({ id, sku });
  }
  if (precisaCheck.length === 0) return { ok: true };

  const ids = precisaCheck.map((p) => p.id);
  const { data: habRows, error } = await supabase
    .from("seller_skus_habilitados")
    .select("sku_id")
    .eq("seller_id", params.sellerId)
    .in("sku_id", ids);

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("does not exist") || error.code === "42P01") {
      return {
        ok: false,
        error:
          "Configuração de catálogo por seller incompleta (tabela seller_skus_habilitados). Entre em contato com o suporte DropCore.",
      };
    }
    return { ok: false, error: msg };
  }

  const okSet = new Set((habRows ?? []).map((r: { sku_id: string }) => r.sku_id));
  for (const p of precisaCheck) {
    if (!okSet.has(p.id)) return { ok: false, error: MSG_SKU_NAO_HABILITADO_PLANO_STARTER };
  }
  return { ok: true };
}

export async function assertPodeRegistrarHabilitacao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    sellerId: string;
    sellerPlano: string | null | undefined;
    orgId: string;
    fornecedorId: string | null | undefined;
    skuId: string;
  }
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!params.fornecedorId) {
    return {
      ok: false,
      error:
        "Escolha e salve o seu fornecedor (armazém) no catálogo ou na Calculadora antes de marcar SKUs para vender.",
      status: 400,
    };
  }

  const { data: skuRow, error: skuErr } = await supabase
    .from("skus")
    .select("id, sku, org_id, fornecedor_id, status")
    .eq("id", params.skuId)
    .maybeSingle();

  if (skuErr) return { ok: false, error: String(skuErr.message) };
  if (!skuRow) return { ok: false, error: "SKU não encontrado.", status: 404 };
  if (String(skuRow.org_id) !== params.orgId) return { ok: false, error: "SKU não pertence à sua organização.", status: 403 };
  if (String(skuRow.fornecedor_id ?? "") !== String(params.fornecedorId)) {
    return { ok: false, error: "SKU não pertence ao fornecedor ligado ao seu perfil.", status: 403 };
  }
  if (String(skuRow.status ?? "").toLowerCase() !== "ativo") {
    return { ok: false, error: "SKU inativo — não pode ser habilitado.", status: 400 };
  }

  if (!skuContaLimiteHabilitacaoSeller(skuRow.sku)) {
    return {
      ok: false,
      error: "Este SKU de sistema não precisa ser habilitado na lista; já pode ser usado nas vendas no plano Starter.",
      status: 400,
    };
  }

  if (isSellerPlanoPro(params.sellerPlano)) return { ok: true };

  const { count, error: cntErr } = await countHabilitadosQueContamNoLimite(supabase, params.sellerId);
  if (cntErr) return { ok: false, error: cntErr };
  if (count >= MAX_SKUS_HABILITADOS_STARTER) {
    return {
      ok: false,
      error: `Você já tem ${MAX_SKUS_HABILITADOS_STARTER} SKUs habilitados. Remova um no catálogo ou faça upgrade para o plano Pro.`,
      status: 403,
    };
  }

  return { ok: true };
}
