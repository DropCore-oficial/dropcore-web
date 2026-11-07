/**
 * POST /api/fornecedor/mercadolivre/sync-estoque — Pull estoque do Mercado Livre do
 * fornecedor → DropCore → sellers. Espelho de /api/fornecedor/olist/sync-estoque.
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { pullFornecedorEstoqueFromMercadoLivre } from "@/lib/fornecedorMercadoLivreSyncEstoque";
import { logAdminAction } from "@/lib/adminAuditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const result = await pullFornecedorEstoqueFromMercadoLivre({
      fornecedorId: ctx.fornecedor_id,
      orgId: ctx.org_id,
    });

    await logAdminAction({
      req,
      orgId: ctx.org_id,
      actorUserId: ctx.user_id,
      action: "marketplace.mercadolivre.sync_manual",
      targetTable: "fornecedor_mercadolivre_integrations",
      targetId: ctx.fornecedor_id,
    });

    return NextResponse.json({ ok: result.status !== "erro", result });
  } catch (e: unknown) {
    console.error("[fornecedor/mercadolivre/sync-estoque]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao sincronizar estoque." },
      { status: 500 },
    );
  }
}
