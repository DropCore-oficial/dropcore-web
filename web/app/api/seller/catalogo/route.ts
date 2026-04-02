/**
 * GET /api/seller/catalogo?q=xxx
 * Catálogo de SKUs para o seller — filtra automaticamente pelo fornecedor conectado.
 * Retorna custo_dropcore (valor total com 15% DropCore). Não expõe custo_base.
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
      .select("id, org_id, fornecedor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (sellerErr || !seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 200).replace(/[%_\\]/g, "");

    // Usa sempre o fornecedor conectado ao seller
    const fornecedorId = (seller as any).fornecedor_id ?? null;

    let query = supabaseAdmin
      .from("skus")
      // custo_dropcore é buscado apenas para calcular custo_total; nunca é retornado ao client
      .select("id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_dropcore, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg, imagem_url, link_fotos, descricao, ncm")
      .eq("org_id", seller.org_id)
      .ilike("status", "ativo")
      .order("sku", { ascending: true })
      .limit(500);

    if (fornecedorId) query = query.eq("fornecedor_id", fornecedorId);
    if (qRaw) query = query.or(`sku.ilike.%${qRaw}%,nome_produto.ilike.%${qRaw}%,cor.ilike.%${qRaw}%,tamanho.ilike.%${qRaw}%`);

    const { data, error } = await query;
    if (error) throw error;

    const parseNum = (v: unknown): number => {
      if (v == null || v === "") return 0;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };

    // custo_dropcore já inclui 15% DropCore — é o custo total que o seller paga
    const items = (data ?? []).map((row) => {
      const cd = parseNum(row.custo_dropcore);
      const custoTotal = cd > 0 ? cd : null;
      const { custo_dropcore: _, ...rest } = row;
      return { ...rest, custo_total: custoTotal };
    });

    return NextResponse.json({
      ok: true,
      items,
      fornecedor_id: fornecedorId,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
