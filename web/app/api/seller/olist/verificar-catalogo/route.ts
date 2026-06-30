/**
 * POST /api/seller/olist/verificar-catalogo — confere SKUs ativos na Olist do seller (somente leitura).
 */
import { NextResponse } from "next/server";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { getSellerOlistApiToken } from "@/lib/sellerOlistIntegration";
import {
  probeSellerCatalogoNaOlist,
  saveSellerOlistCatalogoProbeResult,
} from "@/lib/sellerOlistCatalogoProbe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const apiToken = await getSellerOlistApiToken(seller.id);
    if (!apiToken) {
      return NextResponse.json(
        { error: "Conecte o token da Olist/Tiny em Integrações ERP antes de verificar." },
        { status: 400 },
      );
    }

    const { data: sellerRow, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("fornecedor_id")
      .eq("id", seller.id)
      .maybeSingle();

    if (sellerErr || !sellerRow) {
      return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    }

    const fornecedorId = (sellerRow as { fornecedor_id?: string | null }).fornecedor_id ?? null;
    if (!fornecedorId) {
      return NextResponse.json(
        { error: "Configure o armazém em Produtos antes de verificar o catálogo na Olist." },
        { status: 400 },
      );
    }

    const summary = await probeSellerCatalogoNaOlist({
      apiToken,
      orgId: seller.org_id,
      fornecedorId,
    });

    try {
      await saveSellerOlistCatalogoProbeResult(seller.id, summary);
    } catch (e: unknown) {
      console.warn("[seller/olist/verificar-catalogo] persist:", e);
    }

    return NextResponse.json({
      ok: summary.ausentes === 0,
      summary,
    });
  } catch (e: unknown) {
    console.error("[seller/olist/verificar-catalogo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao verificar catálogo na Olist." },
      { status: 500 },
    );
  }
}
