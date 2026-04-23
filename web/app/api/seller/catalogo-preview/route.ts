/**
 * GET /api/seller/catalogo-preview?fornecedor_id=uuid&q=
 * Vitrine de SKUs de um fornecedor da mesma org — leitura, sem filtrar pelo vínculo do seller.
 * Mesmo cálculo de custo_total que GET /api/seller/catalogo (`sellerCustoTotalPagoUnitario`).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";

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
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (sellerErr || !seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const fornecedorId = (searchParams.get("fornecedor_id") ?? "").trim();
    if (!fornecedorId) return NextResponse.json({ error: "fornecedor_id é obrigatório." }, { status: 400 });

    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select("id")
      .eq("id", fornecedorId)
      .eq("org_id", seller.org_id)
      .maybeSingle();
    if (fornErr) throw fornErr;
    if (!forn) return NextResponse.json({ error: "Fornecedor não encontrado nesta organização." }, { status: 404 });

    const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 200).replace(/[%_\\]/g, "");

    let query = supabaseAdmin
      .from("skus")
      .select(
        "id, sku, nome_produto, cor, tamanho, status, fornecedor_id, estoque_atual, estoque_minimo, custo_dropcore, custo_base, categoria, dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, peso_kg, imagem_url, link_fotos, descricao, ncm",
      )
      .eq("org_id", seller.org_id)
      .eq("fornecedor_id", fornecedorId)
      .ilike("status", "ativo")
      .order("sku", { ascending: true })
      .limit(500);

    if (qRaw) query = query.or(`sku.ilike.%${qRaw}%,nome_produto.ilike.%${qRaw}%,cor.ilike.%${qRaw}%,tamanho.ilike.%${qRaw}%`);

    const { data, error } = await query;
    if (error) throw error;

    const items = (data ?? []).map((row) => {
      const custoTotal = sellerCustoTotalPagoUnitario(
        (row as { custo_base?: unknown }).custo_base,
        (row as { custo_dropcore?: unknown }).custo_dropcore,
      );
      const { custo_dropcore: _cd, custo_base: _cb, ...rest } = row as Record<string, unknown> & {
        custo_dropcore?: unknown;
        custo_base?: unknown;
      };
      return {
        ...rest,
        custo_total: custoTotal,
      };
    });

    return NextResponse.json({
      ok: true,
      fornecedor_id: fornecedorId,
      items,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
