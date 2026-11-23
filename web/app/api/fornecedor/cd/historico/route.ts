/**
 * GET /api/fornecedor/cd/historico — histórico completo das remessas do fornecedor no CD
 * (declarada, conferência com declarado×conferido, baixa manual com motivo).
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
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "", 10) || 30));

    const { data, error } = await supabaseAdmin.rpc("fn_cd_movimentos_historico_lista", {
      p_org_id: ctx.org_id,
      p_fornecedor_id: ctx.fornecedor_id,
      p_limit: perPage,
      p_offset: page * perPage,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, movimentos: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
