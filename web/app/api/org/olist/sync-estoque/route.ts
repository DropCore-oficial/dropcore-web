/**
 * POST /api/org/olist/sync-estoque — admin: empurra saldo para Olist do armazém e dos sellers.
 * Body opcional: { fornecedor_id, grupo_keys: ["DJU001000", ...] }
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { paiKeyFromSku } from "@/lib/sellerCatalogOlistExport";
import { syncOlistEstoqueFornecedorGrupo } from "@/lib/sellerOlistSyncEstoqueOnChange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const fornecedorId =
      typeof body?.fornecedor_id === "string" && body.fornecedor_id.trim()
        ? body.fornecedor_id.trim()
        : null;

    const grupoKeysRaw = body?.grupo_keys;
    const grupoKeys =
      Array.isArray(grupoKeysRaw) && grupoKeysRaw.length > 0
        ? [...new Set(grupoKeysRaw.map((g) => String(g).trim().toUpperCase()).filter(Boolean))]
        : null;

    if (!fornecedorId) {
      return NextResponse.json({ error: "fornecedor_id é obrigatório." }, { status: 400 });
    }

    const keys =
      grupoKeys ??
      (() => {
        const sku = typeof body?.sku === "string" ? body.sku.trim().toUpperCase() : "";
        return sku ? [paiKeyFromSku(sku)] : null;
      })();

    if (!keys?.length) {
      return NextResponse.json({ error: "Informe grupo_keys ou sku." }, { status: 400 });
    }

    let okTotal = 0;
    let sellers = 0;
    const porGrupo: Array<{ grupo: string; ok: number; sellers: number }> = [];

    for (const grupoKey of keys) {
      const r = await syncOlistEstoqueFornecedorGrupo({
        orgId: org_id,
        fornecedorId,
        grupoKey,
      });
      okTotal += r.ok;
      sellers = Math.max(sellers, r.sellers);
      porGrupo.push({ grupo: grupoKey, ok: r.ok, sellers: r.sellers });
    }

    return NextResponse.json({
      ok: true,
      sincronizado: okTotal > 0,
      ok_total: okTotal,
      sellers,
      por_grupo: porGrupo,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg.includes("autentic") || msg.includes("permiss") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
