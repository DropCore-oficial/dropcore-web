/**
 * GET /api/seller/gestores-ia/disputas — reclamações que a Amanda sinalizou pra esse
 * seller, onde uma foto dele pode ajudar (o Mercado Livre não deixa a DropCore baixar a
 * evidência direto pela API — ver docs/SCHEMA.md). Resposta enxuta de propósito: o seller
 * nunca vê resposta do fornecedor nem decisão do admin, só "existe uma reclamação, envie
 * uma foto se conseguir ver".
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: casosRaw, error } = await supabaseAdmin
    .from("seller_ai_disputas_fornecedor")
    .select("id, ml_order_id, ml_item_id, ml_claim_id, evidencia_seller_path, evidencia_seller_enviada_em, status, criado_em")
    .eq("seller_id", seller.id)
    .neq("status", "decidido")
    .order("criado_em", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const casos = (casosRaw ?? []).map((c) => ({
    id: c.id,
    ml_order_id: c.ml_order_id,
    ml_item_id: c.ml_item_id,
    ml_claim_id: c.ml_claim_id,
    foto_enviada: !!c.evidencia_seller_path,
    criado_em: c.criado_em,
  }));

  return NextResponse.json({ ok: true, casos });
}
