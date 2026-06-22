/**
 * POST /api/fornecedor/olist/sync-estoque — Pull estoque da Olist do fornecedor → DropCore → sellers
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { getFornecedorOlistApiToken } from "@/lib/fornecedorOlistIntegration";
import { pullFornecedorEstoqueFromOlist } from "@/lib/fornecedorOlistSyncEstoquePull";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const apiToken = await getFornecedorOlistApiToken(ctx.fornecedor_id);
    if (!apiToken) {
      return NextResponse.json(
        { error: "Conecte o token da Olist/Tiny em Integrações ERP antes de sincronizar." },
        { status: 400 },
      );
    }

    const result = await pullFornecedorEstoqueFromOlist({
      fornecedorId: ctx.fornecedor_id,
      orgId: ctx.org_id,
      apiToken,
    });

    return NextResponse.json({ ok: result.status !== "erro", result });
  } catch (e: unknown) {
    console.error("[fornecedor/olist/sync-estoque]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao sincronizar estoque." },
      { status: 500 },
    );
  }
}
