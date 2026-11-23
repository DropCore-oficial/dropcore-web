/**
 * GET /api/fornecedor/cd/estoque — estoque conferido do próprio fornecedor no CD
 * (lado a lado com o estoque_atual que vale pra vender).
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const perPage = Math.min(200, Math.max(1, parseInt(searchParams.get("perPage") || "", 10) || 50));

    const [estoqueRes, remessasRes, fornecedorRes] = await Promise.all([
      supabaseAdmin.rpc("fn_cd_estoque_conferido_lista", {
        p_org_id: ctx.org_id,
        p_fornecedor_id: ctx.fornecedor_id,
        p_limit: perPage,
        p_offset: page * perPage,
      }),
      supabaseAdmin.rpc("fn_cd_remessas_pendentes_lista", {
        p_org_id: ctx.org_id,
        p_fornecedor_id: ctx.fornecedor_id,
      }),
      supabaseAdmin.from("fornecedores").select("opera_no_cd, cd_fulfillment_taxa_valor").eq("id", ctx.fornecedor_id).maybeSingle(),
    ]);

    if (estoqueRes.error) return NextResponse.json({ error: estoqueRes.error.message }, { status: 500 });
    if (remessasRes.error) return NextResponse.json({ error: remessasRes.error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      skus: estoqueRes.data ?? [],
      remessas_pendentes: remessasRes.data ?? [],
      opera_no_cd: Boolean(fornecedorRes.data?.opera_no_cd),
      cd_fulfillment_taxa_valor:
        fornecedorRes.data?.cd_fulfillment_taxa_valor != null ? Number(fornecedorRes.data.cd_fulfillment_taxa_valor) : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
