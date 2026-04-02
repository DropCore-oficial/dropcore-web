/**
 * GET /api/seller/fornecedores
 * Lista fornecedores da org do seller (para selecionar na calculadora).
 * Requer Bearer token do seller.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    let fornecedorConectadoId: string | null = null;
    try {
      const { data: s2 } = await supabaseAdmin
        .from("sellers")
        .select("fornecedor_id")
        .eq("id", seller.id)
        .maybeSingle();
      fornecedorConectadoId = (s2 as any)?.fornecedor_id ?? null;
    } catch {
      // coluna fornecedor_id pode não existir ainda (rode seller-fornecedor-id.sql)
    }

    const { data: list, error } = await supabaseAdmin
      .from("fornecedores")
      .select("id, nome")
      .eq("org_id", seller.org_id)
      .ilike("status", "ativo")
      .order("nome", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      fornecedores: list ?? [],
      fornecedor_conectado_id: fornecedorConectadoId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
