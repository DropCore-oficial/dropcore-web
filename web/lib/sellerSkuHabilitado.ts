/**
 * Plano Start: até 15 combinações **produto (grupo) + cor** com ao menos uma variação
 * em `seller_skus_habilitados`. Numerações da mesma cor não aumentam o contador.
 * Plano Pro: sem esse teto. SKUs com prefixo PREFIXO_SKU_SISTEMA não entram no limite.
 */
import { PREFIXO_SKU_SISTEMA } from "@/lib/planos";
import {
  MSG_COR_SEM_ESTOQUE_HABILITAR,
  corGrupoTemEstoqueParaHabilitar,
} from "@/lib/sellerSkuReadiness";

export const MSG_SKU_NAO_HABILITADO_PLANO_STARTER =
  "Esta variação não está habilitada no seu plano; ative a cor no catálogo (até 15 produto+cor no Start). Ou faça upgrade para Pro.";

export const MSG_STARTER_PEDIDO_SEM_SKU =
  "No plano Start é obrigatório vincular o pedido a variações do catálogo habilitado. Ou faça upgrade para o plano Pro.";

const MAX_CORES_HABILITADAS_STARTER = 15;

/** Legado / APIs: mesmo valor numérico do teto Start. */
export const MAX_SKUS_HABILITADOS_STARTER = MAX_CORES_HABILITADAS_STARTER;

export function isSellerPlanoPro(plano: string | null | undefined): boolean {
  return String(plano ?? "").trim().toLowerCase() === "pro";
}

/** Se false, o SKU não conta no limite e não exige linha em seller_skus_habilitados para vender (plano Start). */
export function skuContaLimiteHabilitacaoSeller(codigoSku: string | null | undefined): boolean {
  const s = String(codigoSku ?? "").trim().toUpperCase();
  return !s.startsWith(PREFIXO_SKU_SISTEMA.toUpperCase());
}

/** Pai do grupo a partir do código SKU (últimos 3 dígitos → 000). */
export function paiKeySkuHabilitacao(sku: string | null | undefined): string {
  const s = String(sku ?? "").trim();
  return s.length >= 3 ? s.slice(0, -3) + "000" : s;
}

/**
 * Identificador único para o teto Start: um produto (grupo) + uma cor.
 * Só aplica quando o SKU entra no limite (`skuContaLimiteHabilitacaoSeller`).
 */
export function corHabilitacaoKey(sku: string | null | undefined, cor: string | null | undefined): string | null {
  if (!skuContaLimiteHabilitacaoSeller(sku)) return null;
  const pai = paiKeySkuHabilitacao(sku);
  const c = String(cor ?? "").trim().toUpperCase();
  return `${pai}::${c}`;
}

type HabilitadoJoinRow = { skus?: { sku?: string | null; cor?: string | null } | null };

function collectCorKeysFromHabilitadosRows(rows: HabilitadoJoinRow[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const row of rows ?? []) {
    const sk = row?.skus;
    if (!sk) continue;
    const k = corHabilitacaoKey(sk.sku ?? null, sk.cor ?? null);
    if (k) keys.add(k);
  }
  return keys;
}

export async function countHabilitadosQueContamNoLimite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sellerId: string,
): Promise<{ count: number; error?: string }> {
  const { data, error } = await supabase
    .from("seller_skus_habilitados")
    .select("sku_id, skus(sku, cor)")
    .eq("seller_id", sellerId);

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { count: 0, error: "Tabela seller_skus_habilitados inexistente. Execute web/scripts/create-seller-skus-habilitados.sql." };
    }
    return { count: 0, error: msg };
  }

  return { count: collectCorKeysFromHabilitadosRows((data ?? []) as HabilitadoJoinRow[]).size };
}

export type SkuRefParaVenda = { id: string; sku: string };

export async function assertSellerPodeVenderSkus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { sellerId: string; sellerPlano: string | null | undefined; skus: SkuRefParaVenda[] },
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

function skuPrefixBloco(sku: string): string {
  const s = String(sku ?? "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+)(\d{3})\d{3}$/);
  return m ? `${m[1]}${m[2]}` : s.slice(0, 6);
}

async function variantesAtivasMesmaCor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  skuRow: { sku: string; cor: string | null; org_id: string; fornecedor_id: string }
): Promise<{ estoque_atual: number | null }[]> {
  const prefix = skuPrefixBloco(String(skuRow.sku ?? ""));
  const { data, error } = await supabase
    .from("skus")
    .select("estoque_atual, cor, status")
    .eq("org_id", skuRow.org_id)
    .eq("fornecedor_id", skuRow.fornecedor_id)
    .ilike("sku", `${prefix}%`);
  if (error) throw error;
  const corNorm = String(skuRow.cor ?? "").trim().toLowerCase();
  return (data ?? []).filter((r: { cor?: string | null; status?: string | null }) => {
    if (String(r.status ?? "").toLowerCase() !== "ativo") return false;
    const c = String(r.cor ?? "").trim().toLowerCase();
    if (!corNorm) return c === "";
    return c === corNorm;
  });
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
  },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!params.fornecedorId) {
    return {
      ok: false,
      error:
        "Escolha e salve o seu fornecedor (armazém) no catálogo ou na Calculadora antes de marcar variações para vender na API.",
      status: 400,
    };
  }

  const { data: skuRow, error: skuErr } = await supabase
    .from("skus")
    .select("id, sku, cor, org_id, fornecedor_id, status, estoque_atual")
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

  try {
    const irmaos = await variantesAtivasMesmaCor(supabase, {
      sku: String(skuRow.sku ?? ""),
      cor: skuRow.cor != null ? String(skuRow.cor) : null,
      org_id: String(skuRow.org_id),
      fornecedor_id: String(skuRow.fornecedor_id),
    });
    if (irmaos.length === 0) {
      return { ok: false, error: "Nenhuma variação ativa nesta cor.", status: 400 };
    }
    if (!corGrupoTemEstoqueParaHabilitar(irmaos)) {
      return { ok: false, error: MSG_COR_SEM_ESTOQUE_HABILITAR, status: 400 };
    }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao validar estoque." };
  }

  if (!skuContaLimiteHabilitacaoSeller(skuRow.sku)) {
    return {
      ok: false,
      error: "Este SKU de sistema não precisa ser habilitado na lista; já pode ser usado nas vendas no plano Start.",
      status: 400,
    };
  }

  if (isSellerPlanoPro(params.sellerPlano)) return { ok: true };

  const novaChave = corHabilitacaoKey(skuRow.sku, skuRow.cor);
  if (!novaChave) {
    return { ok: true };
  }

  const { data: habData, error: habErr } = await supabase
    .from("seller_skus_habilitados")
    .select("sku_id, skus(sku, cor)")
    .eq("seller_id", params.sellerId);

  if (habErr) {
    const msg = String(habErr.message ?? "");
    if (msg.includes("does not exist") || habErr.code === "42P01") {
      return {
        ok: false,
        error: "Tabela seller_skus_habilitados inexistente. Execute o script create-seller-skus-habilitados.sql no Supabase.",
        status: 503,
      };
    }
    return { ok: false, error: msg };
  }

  const chavesExistentes = collectCorKeysFromHabilitadosRows((habData ?? []) as HabilitadoJoinRow[]);
  if (chavesExistentes.has(novaChave)) {
    return { ok: true };
  }
  if (chavesExistentes.size >= MAX_CORES_HABILITADAS_STARTER) {
    return {
      ok: false,
      error: `No plano Start você já tem ${MAX_CORES_HABILITADAS_STARTER} cores habilitadas (produto + cor). Desligue uma cor no catálogo ou faça upgrade para Pro.`,
      status: 403,
    };
  }

  return { ok: true };
}
