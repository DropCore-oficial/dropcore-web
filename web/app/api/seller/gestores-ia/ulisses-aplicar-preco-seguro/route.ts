/**
 * POST /api/seller/gestores-ia/ulisses-aplicar-preco-seguro — Ulisses escreve de fato o
 * "preço mínimo seguro" calculado (o preço-âncora que faz o desconto ativo não furar a
 * margem mínima do seller) no anúncio do Mercado Livre (PUT /items/{id}). O preço em si
 * já foi calculado no lado servidor na rodada do gestor (`gestorAdsDados.ts`) — aqui só
 * confere posse do item e escreve; não recalcula. Toda tentativa vira uma linha em
 * seller_ai_acoes, é a auditoria geral de ação executada pelos gestores.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarItemTituloEstado,
  mlAtualizarPrecoSeguro,
} from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function registrarAcao(params: {
  req: Request;
  orgId: string;
  sellerId: string;
  actorUserId: string | null;
  itemId: string;
  status: "executado" | "erro";
  detalhes: Record<string, unknown>;
}) {
  await supabaseAdmin.from("seller_ai_acoes").insert({
    org_id: params.orgId,
    seller_id: params.sellerId,
    gestor: "ads",
    alvo_tipo: "ml_item",
    alvo_id: params.itemId,
    acao: "aplicar_preco_seguro",
    status: params.status,
    detalhes: params.detalhes,
    actor_user_id: params.actorUserId,
    ip_address: getRequestIp(params.req),
    user_agent: params.req.headers.get("user-agent"),
    executado_em: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { item_id?: string; preco_novo?: number };
  const itemId = body.item_id?.trim();
  const precoNovo = body.preco_novo;
  if (!itemId || typeof precoNovo !== "number" || !Number.isFinite(precoNovo) || precoNovo <= 0) {
    return NextResponse.json({ error: "item_id e preco_novo (número > 0) são obrigatórios." }, { status: 400 });
  }

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual")
    .eq("id", seller.id)
    .maybeSingle();
  if (!isPro({ plano: sellerRow?.plano })) {
    return NextResponse.json({ error: "Gestores de IA são exclusivos do plano Pro." }, { status: 403 });
  }
  if (Math.max(0, Number(sellerRow?.saldo_atual ?? 0)) <= 0) {
    return NextResponse.json({ error: "Recarregue seu saldo pra usar os Gestores de IA." }, { status: 402 });
  }

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar o preço." }, { status: 422 });
  }

  const estado = await mlBuscarItemTituloEstado(itemId, ctx);
  if (!estado) {
    return NextResponse.json({ error: "Não foi possível consultar o anúncio no Mercado Livre." }, { status: 502 });
  }
  if (String(estado.seller_id) !== ctx.mlUserId) {
    return NextResponse.json({ error: "Esse anúncio não pertence à sua conta do Mercado Livre." }, { status: 403 });
  }

  const resultado = await mlAtualizarPrecoSeguro(itemId, precoNovo, ctx);
  if (!resultado.ok) {
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      itemId,
      status: "erro",
      detalhes: { erro: resultado.erro, preco_novo: precoNovo },
    });
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  await registrarAcao({
    req,
    orgId: seller.org_id,
    sellerId: seller.id,
    actorUserId: seller.user_id ?? null,
    itemId,
    status: "executado",
    detalhes: { preco_novo: precoNovo, age_group_corrigido: resultado.ageGroupCorrigido },
  });

  return NextResponse.json({ ok: true, preco: precoNovo });
}
