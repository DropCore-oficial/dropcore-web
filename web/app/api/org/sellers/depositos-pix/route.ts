/**
 * GET /api/org/sellers/depositos-pix?status=pendente
 * Lista depósitos PIX da org. status=pendente (default), aprovado, ou todos.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "pendente";

    let query = supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, seller_id, valor, chave_pix, status, referencia, criado_em, aprovado_em")
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(100);

    if (statusFilter !== "todos") {
      query = query.eq("status", statusFilter);
    }

    const { data: depositos, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!depositos || depositos.length === 0) {
      return NextResponse.json([]);
    }

    const sellerIds = [...new Set(depositos.map((d: { seller_id: string }) => d.seller_id))];
    const { data: sellers } = await supabaseAdmin
      .from("sellers")
      .select("id, nome, documento")
      .in("id", sellerIds);

    const sellerMap = new Map((sellers || []).map((s: { id: string; nome: string; documento: string }) => [s.id, s]));
    const list = depositos.map((d: Record<string, unknown>) => {
      const s = sellerMap.get(d.seller_id as string);
      return { ...d, seller_nome: s?.nome ?? "—", seller_documento: s?.documento ?? null };
    });

    return NextResponse.json(list);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
