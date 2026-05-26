/**
 * GET /api/seller/catalogo/tabela-medidas?grupoKey=DJU100000
 * Retorna a tabela de medidas aprovada do grupo para o seller (catálogo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProdutoTabelaMedidas, orgPossuiGrupoSku } from "@/lib/produtoTabelaMedidasDb";
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

    const acesso = await orgPossuiGrupoSku(supabaseAdmin, seller.org_id, grupoKey);
    if (!acesso.ok) {
      return NextResponse.json({ error: "Grupo não encontrado no catálogo." }, { status: 404 });
    }

    const fornecedorParam = (searchParams.get("fornecedor_id") ?? "").trim();
    const sellerForn = (seller as { fornecedor_id?: string | null }).fornecedor_id ?? null;
    const fornecedorGrupo = acesso.fornecedor_id;
    if (sellerForn && fornecedorGrupo && sellerForn !== fornecedorGrupo) {
      return NextResponse.json({ aprovada: null });
    }
    if (fornecedorParam && fornecedorGrupo && fornecedorParam !== fornecedorGrupo) {
      return NextResponse.json({ aprovada: null });
    }

    const row = await getProdutoTabelaMedidas(supabaseAdmin, grupoKey);

    return NextResponse.json({
      aprovada: row ? { tipo_produto: row.tipo_produto, medidas: row.medidas } : null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
