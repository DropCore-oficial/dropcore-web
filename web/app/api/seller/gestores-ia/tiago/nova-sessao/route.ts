/**
 * POST /api/seller/gestores-ia/tiago/nova-sessao — botão "Nova conversa" no chat do Tiago.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { temAddonGestoresIaAtivo } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("gestores_ia_addon_ativo")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }
  if (!temAddonGestoresIaAtivo(sellerRow)) {
    return NextResponse.json({ error: "O chat com o Tiago Silva exige o add-on Gestores de IA." }, { status: 403 });
  }

  const { data: sessionId, error } = await supabaseAdmin.rpc("fn_seller_ai_chat_criar_sessao", {
    p_seller_id: seller.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, session_id: sessionId });
}
