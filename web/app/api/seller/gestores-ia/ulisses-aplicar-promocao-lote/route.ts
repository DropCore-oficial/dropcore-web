/**
 * POST /api/seller/gestores-ia/ulisses-aplicar-promocao-lote — inscreve um grupo de itens
 * (família de SKUs sem nenhuma promoção ativa) numa promoção `PRICE_DISCOUNT` de verdade no
 * Mercado Livre (não é só reescrever `price` como `ulisses-aplicar-preco-seguro` — isso cria
 * a promoção com badge/prazo/"de-por" real, ver `mlCriarPromocaoPrecoDesconto`). O preço é
 * editável pelo seller (não precisa ser exatamente o "preço mínimo seguro" sugerido); quando
 * o valor digitado fura a margem mínima calculada pelo Ulisses, exige `confirmar_abaixo_minimo`
 * explícito antes de escrever qualquer coisa — pedido do Sr Stark (2026-09-08): dar liberdade
 * pro seller decidir, mas nunca em silêncio.
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
  mlBuscarLimitesPromocaoPrecoDesconto,
  mlCriarPromocaoPrecoDesconto,
} from "@/lib/mercadoLivreApiClient";
import { montarResultadoAds } from "@/lib/ai/gestorAdsDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITENS_POR_LOTE = 30;

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
    acao: "aplicar_promocao_preco_desconto",
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

  const body = (await req.json().catch(() => ({}))) as {
    item_ids?: string[];
    preco_promocional?: number;
    confirmar_abaixo_minimo?: boolean;
  };
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((id) => id.trim()).filter(Boolean) : [];
  const precoPromocional = body.preco_promocional;
  const confirmarAbaixoMinimo = body.confirmar_abaixo_minimo === true;
  if (itemIds.length === 0 || typeof precoPromocional !== "number" || !Number.isFinite(precoPromocional) || precoPromocional <= 0) {
    return NextResponse.json({ error: "item_ids (lista) e preco_promocional (número > 0) são obrigatórios." }, { status: 400 });
  }
  if (itemIds.length > MAX_ITENS_POR_LOTE) {
    return NextResponse.json({ error: `No máximo ${MAX_ITENS_POR_LOTE} itens por lote.` }, { status: 400 });
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
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar a promoção." }, { status: 422 });
  }

  // Preço mínimo seguro é lógica de negócio — nunca confiar no que o front manda de volta,
  // recalcula aqui (mesma fonte que a tela usa pra sugerir o valor) antes de decidir se fura
  // a margem mínima ou não.
  const resultado = await montarResultadoAds(seller.id);
  const floorPorItemId = new Map<string, number | null>();
  for (const s of resultado?.skus ?? []) floorPorItemId.set(s.item_id, s.preco_minimo_seguro);

  const itensAbaixoMinimo: { item_id: string; preco_minimo_seguro: number }[] = [];
  for (const itemId of itemIds) {
    const floor = floorPorItemId.get(itemId);
    if (floor != null && precoPromocional < floor) {
      itensAbaixoMinimo.push({ item_id: itemId, preco_minimo_seguro: floor });
    }
  }
  if (itensAbaixoMinimo.length > 0 && !confirmarAbaixoMinimo) {
    return NextResponse.json(
      {
        error: "Esse preço fura a margem mínima em pelo menos 1 SKU do grupo.",
        requer_confirmacao: true,
        itens_abaixo_minimo: itensAbaixoMinimo,
      },
      { status: 409 }
    );
  }

  const resultados: { item_id: string; ok: boolean; erro?: string }[] = [];

  for (const itemId of itemIds) {
    const estado = await mlBuscarItemTituloEstado(itemId, ctx);
    if (!estado || String(estado.seller_id) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Anúncio não encontrado ou não pertence à sua conta." });
      continue;
    }

    const limites = await mlBuscarLimitesPromocaoPrecoDesconto(itemId, ctx);
    if (limites && (precoPromocional < limites.min || precoPromocional > limites.max)) {
      const erro = `O Mercado Livre só aceita entre R$ ${limites.min.toFixed(2)} e R$ ${limites.max.toFixed(2)} pra esse item.`;
      resultados.push({ item_id: itemId, ok: false, erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { erro, preco_promocional: precoPromocional, lote: true },
      });
      continue;
    }

    const resultadoCriacao = await mlCriarPromocaoPrecoDesconto(itemId, precoPromocional, ctx);
    if (!resultadoCriacao.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: resultadoCriacao.erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { erro: resultadoCriacao.erro, preco_promocional: precoPromocional, lote: true },
      });
      continue;
    }

    resultados.push({ item_id: itemId, ok: true });
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      itemId,
      status: "executado",
      detalhes: {
        preco_promocional: precoPromocional,
        preco_minimo_seguro: floorPorItemId.get(itemId) ?? null,
        furou_minimo: floorPorItemId.get(itemId) != null && precoPromocional < (floorPorItemId.get(itemId) as number),
        offer_id: resultadoCriacao.offerId,
        lote: true,
      },
    });
  }

  return NextResponse.json({ ok: true, preco: precoPromocional, resultados });
}
