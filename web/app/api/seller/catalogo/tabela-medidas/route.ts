/**
 * GET /api/seller/catalogo/tabela-medidas?grupoKey=DJU100000
 * Retorna a tabela de medidas aprovada do grupo para o seller (catálogo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Sem token." }, { status: 401 });

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("org_id, fornecedor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (sellerErr || !seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const grupoKey = (searchParams.get("grupoKey") ?? "").trim().toUpperCase();
    if (!grupoKey) return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });

    const fornecedorId = (seller as { fornecedor_id?: string }).fornecedor_id ?? null;
    if (!fornecedorId) return NextResponse.json({ aprovada: null });

    const { data: row } = await supabaseAdmin
      .from("produto_tabela_medidas")
      .select("tipo_produto, medidas")
      .eq("org_id", seller.org_id)
      .eq("fornecedor_id", fornecedorId)
      .eq("grupo_sku", grupoKey)
      .maybeSingle();

    return NextResponse.json({
      aprovada: row
        ? { tipo_produto: row.tipo_produto ?? "generico", medidas: row.medidas ?? {} }
        : null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
