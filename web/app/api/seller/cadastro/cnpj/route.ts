/**
 * GET /api/seller/cadastro/cnpj?cnpj=00000000000000
 * Mesma consulta BrasilAPI / ReceitaWS do fornecedor; requer sessão seller (Bearer).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { consultarCnpjNaReceitaFederal } from "@/lib/cnpjBrasilConsulta";

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
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const cnpjDigits = normalizeCnpjInput(searchParams.get("cnpj"));

    const result = await consultarCnpjNaReceitaFederal(cnpjDigits);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      cnpj: result.cnpj,
      fonte: result.fonte,
      empresa: result.empresa,
    });
  } catch {
    return NextResponse.json({ error: "Erro inesperado na validação de CNPJ." }, { status: 500 });
  }
}
