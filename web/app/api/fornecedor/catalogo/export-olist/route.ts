/**
 * GET /api/fornecedor/catalogo/export-olist?grupo=PAI000
 * CSV no padrão Olist/Tiny (64 colunas) — um produto/grupo por vez.
 * Sem `grupo` (ou `?all=1`): exporta o catálogo ativo inteiro num CSV só.
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { loadFornecedorSkusForOlistExport } from "@/lib/fornecedorCatalogOlistLoad";
import { normalizeImagensForOlistExport } from "@/lib/fornecedorImagemPublicaOlist";
import {
  buildOlistProdutosCsv,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const url = new URL(req.url);
    const grupoRaw =
      (url.searchParams.get("grupo") ?? url.searchParams.get("pai_key") ?? url.searchParams.get("grupoKey") ?? "")
        .trim()
        .toUpperCase() || null;
    const exportarTudo = !grupoRaw;
    const categoriaOlistParam = (url.searchParams.get("categoria") ?? url.searchParams.get("categoria_olist") ?? "")
      .trim() || null;

    const loaded = await loadFornecedorSkusForOlistExport({
      orgId: ctx.org_id,
      fornecedorId: ctx.fornecedor_id,
      grupoKey: grupoRaw ?? undefined,
      categoriaOlist: categoriaOlistParam,
      supabase: supabaseAdmin,
    });

    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error, grupo: grupoRaw }, { status: loaded.status });
    }

    const withPublicImagens = await normalizeImagensForOlistExport(
      loaded.items.map((item) => ({
        ...item,
        id: item.id ?? "",
      })),
      { supabase: supabaseAdmin, orgId: ctx.org_id, fornecedorId: ctx.fornecedor_id },
    );
    const filteredForCsv: CatalogSkuForOlistExport[] = withPublicImagens.map(({ id: _id, ...rest }) => rest);

    const csv = buildOlistProdutosCsv(filteredForCsv, { margemPct: 0 });
    const date = new Date().toISOString().slice(0, 10);
    const filename = exportarTudo
      ? `dropcore-olist-fornecedor-todos-${date}.csv`
      : `dropcore-olist-fornecedor-${grupoRaw}-${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: unknown) {
    console.error("[fornecedor/catalogo/export-olist]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
