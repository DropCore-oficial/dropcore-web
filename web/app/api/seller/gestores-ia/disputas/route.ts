/**
 * GET /api/seller/gestores-ia/disputas — reclamações que a Amanda sinalizou pra esse
 * seller, onde uma foto dele pode ajudar (o Mercado Livre não deixa a DropCore baixar a
 * evidência direto pela API — ver docs/SCHEMA.md). Resposta enxuta de propósito: o seller
 * nunca vê resposta do fornecedor nem decisão do admin, só "existe uma reclamação, envie
 * uma foto se conseguir ver".
 *
 * Achado real 2026-10-01: um caso gravado aqui nunca é atualizado depois (só sai da lista
 * quando vira "decidido" — ação manual do admin/fornecedor). Se o Mercado Livre fechar a
 * reclamação sozinho nesse meio tempo (comprador favorecido, devolução concluída etc.), o
 * caso continuava aparecendo pro seller como pendente e o link "Ver reclamação" quebrava no
 * próprio Mercado Livre (eles não abrem mais a tela de mediação de reclamação já fechada).
 * Checa o status ao vivo antes de devolver — filtra o que já não está mais "opened" no ML.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { getValidMercadoLivreAccessToken, mlReclamacaoAindaAberta } from "@/lib/mercadoLivreApiClient";

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

  let candidatos = casosRaw ?? [];

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
  if (ctx && candidatos.length > 0) {
    const aindaAbertas = await Promise.all(
      candidatos.map((c) => mlReclamacaoAindaAberta(c.ml_claim_id, ctx))
    );
    candidatos = candidatos.filter((_, i) => aindaAbertas[i]);
  }

  const casos = candidatos.map((c) => ({
    id: c.id,
    ml_order_id: c.ml_order_id,
    ml_item_id: c.ml_item_id,
    ml_claim_id: c.ml_claim_id,
    foto_enviada: !!c.evidencia_seller_path,
    criado_em: c.criado_em,
  }));

  return NextResponse.json({ ok: true, casos });
}
