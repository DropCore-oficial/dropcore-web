/**
 * GET /api/seller/fornecedores
 * Lista fornecedores da org (cadastro resumido) e o vínculo atual do seller.
 * POST não é usado aqui — ver POST /api/seller/fornecedor-vinculo.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { loadSellerFornecedoresList, loadSellerFornecedorVinculoMeta } from "@/lib/sellerFornecedoresList";

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

    const { fornecedor_conectado_id: fornecedorConectadoId, fornecedor_vinculado_em: fornecedorVinculadoEm, fornecedor_desvinculo_liberado: fornecedorDesvinculoLiberado } =
      await loadSellerFornecedorVinculoMeta(seller.id);

    const { fornecedores, fornecedor_conectado_id, vinculo } = await loadSellerFornecedoresList(
      seller.org_id,
      fornecedorConectadoId,
      fornecedorVinculadoEm,
      fornecedorDesvinculoLiberado
    );

    return NextResponse.json({ ok: true, fornecedores, fornecedor_conectado_id, vinculo });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
