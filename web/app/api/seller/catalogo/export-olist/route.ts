/**
 * GET /api/seller/catalogo/export-olist?grupo=PAI000&scope=habilitados|todos
 * CSV no padrão da planilha Olist/Tiny (um produto/grupo por vez via ?grupo=).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import {
  buildOlistProdutosCsv,
  filterSkusByGrupo,
  filterSkusForOlistExport,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import { normalizeImagensForOlistExport } from "@/lib/fornecedorImagemPublicaOlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const url = new URL(req.url);
    const scopeRaw = (url.searchParams.get("scope") ?? "todos").trim().toLowerCase();
    const scope = scopeRaw === "habilitados" ? "habilitados" : "todos";
    const margemRaw = url.searchParams.get("margem") ?? url.searchParams.get("markup");
    const margemPct =
      margemRaw != null && margemRaw.trim() !== ""
        ? Math.max(0, Math.min(500, Number.parseFloat(margemRaw.replace(",", ".")) || 0))
        : 0;
    const grupoRaw =
      (url.searchParams.get("grupo") ?? url.searchParams.get("pai_key") ?? url.searchParams.get("grupoKey") ?? "")
        .trim()
        .toUpperCase() || null;
    const categoriaOlistParam = (url.searchParams.get("categoria") ?? url.searchParams.get("categoria_olist") ?? "")
      .trim() || null;

    const { data: sellerRow, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("fornecedor_id")
      .eq("id", seller.id)
      .maybeSingle();

    if (sellerErr || !sellerRow) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const fornecedorId = (sellerRow as { fornecedor_id?: string | null }).fornecedor_id ?? null;
    if (!fornecedorId) {
      return NextResponse.json(
        {
          error:
            "Configure o armazém em Produtos antes de exportar. O catálogo só aparece com fornecedor vinculado.",
        },
        { status: 400 },
      );
    }

    const habilitadoSet = new Set<string>();
    const { data: habRows, error: habErr } = await supabaseAdmin
      .from("seller_skus_habilitados")
      .select("sku_id")
      .eq("seller_id", seller.id);
    if (!habErr) {
      for (const r of habRows ?? []) {
        habilitadoSet.add(String((r as { sku_id: string }).sku_id));
      }
    }

    const { data: rows, error } = await supabaseAdmin
      .from("skus")
      .select(
        "id, sku, nome_produto, cor, tamanho, status, categoria, estoque_atual, custo_dropcore, custo_base, imagem_url, link_fotos, descricao, ncm, origem, marca, cest, peso_kg, peso_liquido_kg, peso_bruto_kg, comprimento_cm, largura_cm, altura_cm",
      )
      .eq("org_id", seller.org_id)
      .eq("fornecedor_id", fornecedorId)
      .ilike("status", "ativo")
      .order("sku", { ascending: true })
      .limit(600);

    if (error) {
      console.error("[catalogo/export-olist]", error.message);
      return NextResponse.json({ error: "Erro ao carregar catálogo." }, { status: 500 });
    }

    const mapped: CatalogSkuForOlistExport[] = (rows ?? []).map((row) => {
      const id = String((row as { id?: string }).id ?? "");
      const custoTotal = sellerCustoTotalPagoUnitario(
        (row as { custo_base?: unknown }).custo_base,
        (row as { custo_dropcore?: unknown }).custo_dropcore,
      );
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
        custo_total: custoTotal,
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
        habilitado_venda: habilitadoSet.has(id),
      };
    });

    let filtered = filterSkusForOlistExport(mapped, scope);
    if (grupoRaw) {
      filtered = filterSkusByGrupo(filtered, grupoRaw);
      if (filtered.length === 0) {
        return NextResponse.json(
          {
            error: `Nenhum SKU ativo encontrado para o grupo ${grupoRaw}.`,
            grupo: grupoRaw,
          },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "Informe o grupo do produto (ex.: ?grupo=CAM000). Use o botão Exportar para Olist em cada produto na lista.",
        },
        { status: 400 },
      );
    }

    if (categoriaOlistParam) {
      filtered = filtered.map((item) => ({ ...item, categoria: categoriaOlistParam }));
    }

    if (filtered.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Muitos itens (${filtered.length}). A Olist recomenda até ${MAX_ROWS} linhas por planilha.`,
          count: filtered.length,
          max: MAX_ROWS,
        },
        { status: 400 },
      );
    }

    const withPublicImagens = await normalizeImagensForOlistExport(
      filtered.map((item) => ({
        ...item,
        id: item.id ?? "",
      })),
      { supabase: supabaseAdmin, orgId: seller.org_id, fornecedorId },
    );
    const filteredForCsv: CatalogSkuForOlistExport[] = withPublicImagens.map(({ id: _id, ...rest }) => rest);

    const csv = buildOlistProdutosCsv(filteredForCsv, { margemPct });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `dropcore-olist-${grupoRaw}-${scope}-${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: unknown) {
    console.error("[catalogo/export-olist]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
