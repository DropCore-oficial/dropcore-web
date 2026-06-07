/**
 * GET /api/seller/catalogo/export-olist?grupo=PAI000&scope=habilitados|todos
 * CSV no padrão da planilha Olist/Tiny (um produto/grupo por vez via ?grupo=).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import {
  buildOlistProdutosCsv,
  type CatalogSkuForOlistExport,
} from "@/lib/sellerCatalogOlistExport";
import { normalizeImagensForOlistExport } from "@/lib/fornecedorImagemPublicaOlist";
import { loadCatalogSkusForOlistExport } from "@/lib/sellerCatalogOlistLoad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (!grupoRaw) {
      return NextResponse.json(
        {
          error:
            "Informe o grupo do produto (ex.: ?grupo=CAM000). Use o botão Exportar para Olist em cada produto na lista.",
        },
        { status: 400 },
      );
    }

    const loaded = await loadCatalogSkusForOlistExport({
      orgId: seller.org_id,
      sellerId: seller.id,
      fornecedorId,
      grupoKey: grupoRaw,
      scope,
      categoriaOlist: categoriaOlistParam,
      supabase: supabaseAdmin,
    });

    if (!loaded.ok) {
      return NextResponse.json(
        { error: loaded.error, grupo: grupoRaw },
        { status: loaded.status },
      );
    }

    const withPublicImagens = await normalizeImagensForOlistExport(
      loaded.items.map((item) => ({
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
