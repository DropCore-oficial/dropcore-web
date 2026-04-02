/**
 * GET /api/seller/produtos?fornecedorId=xxx
 * Lista produtos (SKUs) do fornecedor com custo, para a calculadora.
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

    const { searchParams } = new URL(req.url);
    const fornecedorId = (searchParams.get("fornecedorId") ?? "").trim();
    if (!fornecedorId) {
      return NextResponse.json({ ok: true, produtos: [] });
    }

    // Garantir que o fornecedor pertence à mesma org
    const { data: forn } = await supabaseAdmin
      .from("fornecedores")
      .select("id")
      .eq("id", fornecedorId)
      .eq("org_id", seller.org_id)
      .maybeSingle();

    if (!forn) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const { data: list, error } = await supabaseAdmin
      .from("skus")
      .select("id, sku, nome_produto, custo_base, custo_dropcore")
      .eq("org_id", seller.org_id)
      .eq("fornecedor_id", fornecedorId)
      .ilike("status", "ativo")
      .order("nome_produto", { ascending: true })
      .limit(500);

    if (error) throw error;

    // custo_dropcore já inclui 15% embutido = valor total que o seller paga. custo_base é referência (fornecedor).
    const parseNum = (v: unknown): number => {
      if (v == null || v === "") return 0;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const s = String(v).replace(",", ".");
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };
    const produtos = (list ?? []).map((r) => {
      const cb = parseNum(r.custo_base);
      const cd = parseNum(r.custo_dropcore);
      // custo_dropcore = total (fornecedor + 15%). Se vazio, usa custo_base + 15%
      const custoTotal = cd > 0 ? cd : (cb > 0 ? Math.round(cb * 1.15 * 100) / 100 : 0);
      return {
        id: r.id,
        sku: r.sku,
        nome_produto: r.nome_produto ?? r.sku,
        custo: custoTotal,
        // custo_base e custo_dropcore não são retornados — evitar expor margem interna
      };
    });

    return NextResponse.json({ ok: true, produtos });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
