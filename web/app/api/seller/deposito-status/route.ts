/**
 * GET /api/seller/deposito-status
 * Diz se o seller autenticado precisa fazer a primeira recarga PIX antes de operar
 * com o fornecedor vinculado (nunca teve um depósito aprovado).
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

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id, fornecedor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    if (!seller.fornecedor_id) {
      return NextResponse.json({ precisa_depositar: false });
    }

    const { data: deposito } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("status", "aprovado")
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ precisa_depositar: !deposito });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
