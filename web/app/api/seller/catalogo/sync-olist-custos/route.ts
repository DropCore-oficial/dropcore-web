/**
 * POST /api/seller/catalogo/sync-olist-custos?grupo=PAI000|all
 * Envia preço de venda e custo para a Olist via API (produto.alterar.php).
 * Sem ?grupo= ou ?grupo=all → sincroniza todo o catálogo do armazém.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import { loadCatalogSkusForOlistExport } from "@/lib/sellerCatalogOlistLoad";
import { syncOlistCustosGrupo } from "@/lib/sellerOlistSyncCustos";
import { syncOlistPrecosCatalogoSeller } from "@/lib/sellerOlistSyncPrecosCatalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseQuery(req: Request) {
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
      .toUpperCase() || "";
  const syncAll = !grupoRaw || grupoRaw === "ALL" || grupoRaw === "TODOS";
  return { scope, margemPct, grupoKey: syncAll ? null : grupoRaw, syncAll };
}

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { scope, margemPct, grupoKey, syncAll } = parseQuery(req);

    const apiToken = await getSellerOlistApiToken(seller.id);
    if (!apiToken) {
      return NextResponse.json(
        {
          error: "Conecte a Olist em Integração ERP para sincronizar preços automaticamente.",
          code: "olist_not_connected",
        },
        { status: 400 },
      );
    }

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
        { error: "Configure o armazém em Produtos antes de sincronizar preços." },
        { status: 400 },
      );
    }

    if (syncAll) {
      const result = await syncOlistPrecosCatalogoSeller({
        apiToken,
        orgId: seller.org_id,
        sellerId: seller.id,
        fornecedorId,
        scope: scope as "habilitados" | "todos",
        margemPct,
        supabase: supabaseAdmin,
      });

      return NextResponse.json({
        scope: "catalogo_completo",
        ...result,
        com_custo: result.ok,
        total: result.grupos,
        sincronizado: result.ok > 0,
      });
    }

    const loaded = await loadCatalogSkusForOlistExport({
      orgId: seller.org_id,
      sellerId: seller.id,
      fornecedorId,
      grupoKey: grupoKey!,
      scope: scope as "habilitados" | "todos",
      supabase: supabaseAdmin,
    });

    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error, grupo: grupoKey }, { status: loaded.status });
    }

    const result = await syncOlistCustosGrupo(apiToken, loaded.items, { margemPct });

    return NextResponse.json({
      grupo: grupoKey,
      ...result,
      sincronizado: result.ok > 0,
    });
  } catch (e: unknown) {
    console.error("[catalogo/sync-olist-custos]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
