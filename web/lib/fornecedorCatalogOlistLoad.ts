import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterSkusByGrupo,
  filterSkusForOlistExport,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import type { LoadCatalogOlistResult } from "@/lib/sellerCatalogOlistLoad";

/** Catálogo do armazém para planilha Olist (64 colunas) — preço = custo_base do fornecedor. */
export async function loadFornecedorSkusForOlistExport(opts: {
  orgId: string;
  fornecedorId: string;
  grupoKey: string;
  categoriaOlist?: string | null;
  supabase: SupabaseClient;
  maxRows?: number;
}): Promise<LoadCatalogOlistResult> {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) {
    return { ok: false, error: "Informe o grupo do produto (ex.: DJU001000).", status: 400 };
  }

  const maxRows = opts.maxRows ?? 500;

  const { data: rows, error } = await opts.supabase
    .from("skus")
    .select(
      "id, sku, nome_produto, cor, tamanho, status, categoria, estoque_atual, custo_base, imagem_url, link_fotos, descricao, ncm, origem, marca, cest, peso_kg, peso_liquido_kg, peso_bruto_kg, comprimento_cm, largura_cm, altura_cm",
    )
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .ilike("status", "ativo")
    .order("sku", { ascending: true })
    .limit(600);

  if (error) {
    return { ok: false, error: "Erro ao carregar catálogo.", status: 500 };
  }

  const mapped: CatalogSkuForOlistExport[] = (rows ?? []).map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    const custoBaseRaw = (row as { custo_base?: unknown }).custo_base;
    const custoBase =
      typeof custoBaseRaw === "number" && Number.isFinite(custoBaseRaw) ? custoBaseRaw : null;

    return {
      id,
      sku: String((row as { sku?: string }).sku ?? ""),
      nome_produto: String((row as { nome_produto?: string }).nome_produto ?? ""),
      cor: String((row as { cor?: string }).cor ?? ""),
      tamanho: String((row as { tamanho?: string }).tamanho ?? ""),
      status: String((row as { status?: string }).status ?? ""),
      categoria: (row as { categoria?: string | null }).categoria ?? null,
      estoque_atual:
        typeof (row as { estoque_atual?: number }).estoque_atual === "number"
          ? (row as { estoque_atual: number }).estoque_atual
          : null,
      custo_total: custoBase,
      imagem_url: (row as { imagem_url?: string | null }).imagem_url ?? null,
      link_fotos: (row as { link_fotos?: string | null }).link_fotos ?? null,
      descricao: (row as { descricao?: string | null }).descricao ?? null,
      ncm: (row as { ncm?: string | null }).ncm ?? null,
      origem: (row as { origem?: string | null }).origem ?? null,
      marca: (row as { marca?: string | null }).marca ?? null,
      cest: (row as { cest?: string | null }).cest ?? null,
      peso_kg: typeof (row as { peso_kg?: number }).peso_kg === "number" ? (row as { peso_kg: number }).peso_kg : null,
      peso_liquido_kg:
        typeof (row as { peso_liquido_kg?: number }).peso_liquido_kg === "number"
          ? (row as { peso_liquido_kg: number }).peso_liquido_kg
          : null,
      peso_bruto_kg:
        typeof (row as { peso_bruto_kg?: number }).peso_bruto_kg === "number"
          ? (row as { peso_bruto_kg: number }).peso_bruto_kg
          : null,
      comprimento_cm:
        typeof (row as { comprimento_cm?: number }).comprimento_cm === "number"
          ? (row as { comprimento_cm: number }).comprimento_cm
          : null,
      largura_cm:
        typeof (row as { largura_cm?: number }).largura_cm === "number" ? (row as { largura_cm: number }).largura_cm : null,
      altura_cm:
        typeof (row as { altura_cm?: number }).altura_cm === "number" ? (row as { altura_cm: number }).altura_cm : null,
      habilitado_venda: true,
    };
  });

  let filtered = filterSkusForOlistExport(mapped, "todos");
  filtered = filterSkusByGrupo(filtered, grupoKey);
  if (filtered.length === 0) {
    return { ok: false, error: `Nenhum SKU ativo encontrado para o grupo ${grupoKey}.`, status: 400 };
  }

  if (opts.categoriaOlist?.trim()) {
    filtered = filtered.map((item) => ({ ...item, categoria: opts.categoriaOlist!.trim() }));
  }

  if (filtered.length > maxRows) {
    return {
      ok: false,
      error: `Muitos itens (${filtered.length}). A Olist recomenda até ${maxRows} linhas por planilha.`,
      status: 400,
    };
  }

  return { ok: true, items: filtered, grupoKey };
}
