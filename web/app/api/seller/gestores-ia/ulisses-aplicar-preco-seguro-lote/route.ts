/**
 * POST /api/seller/gestores-ia/ulisses-aplicar-preco-seguro-lote — igual a
 * `ulisses-aplicar-preco-seguro`, mas aplica o MESMO preço-âncora num grupo de itens de uma
 * vez (ex. todos os SKUs afetados pela mesma promoção). Só faz sentido aplicar pra cima: o
 * preço-alvo aqui é o maior "preço mínimo seguro" entre os SKUs do grupo, então nenhum item
 * fica com margem abaixo do que ele mesmo precisa — quem precisava de menos só sobra com
 * folga extra, não é um risco. Cada item é uma tentativa independente (não é atômico:
 * alguns podem aplicar e outros falhar) e cada um vira sua própria linha em
 * seller_ai_acoes, igual ao fluxo de item único.
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

  const body = (await req.json().catch(() => ({}))) as {
    item_ids?: string[];
    preco_novo?: number;
    confirmar_abaixo_minimo?: boolean;
  };
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((id) => id.trim()).filter(Boolean) : [];
  const precoNovo = body.preco_novo;
  const confirmarAbaixoMinimo = body.confirmar_abaixo_minimo === true;
  if (itemIds.length === 0 || typeof precoNovo !== "number" || !Number.isFinite(precoNovo) || precoNovo <= 0) {
    return NextResponse.json({ error: "item_ids (lista) e preco_novo (número > 0) são obrigatórios." }, { status: 400 });
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
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar o preço." }, { status: 422 });
  }

  // Preço mínimo seguro é lógica de negócio — nunca confiar no que o front manda de volta
  // (o campo agora é editável na tela), recalcula aqui antes de decidir se fura a margem
  // mínima ou não.
  const resultadoAds = await montarResultadoAds(seller.id);
  const floorPorItemId = new Map<string, number | null>();
  for (const s of resultadoAds?.skus ?? []) floorPorItemId.set(s.item_id, s.preco_minimo_seguro);

  const itensAbaixoMinimo: { item_id: string; preco_minimo_seguro: number }[] = [];
  for (const itemId of itemIds) {
    const floor = floorPorItemId.get(itemId);
    if (floor != null && precoNovo < floor) {
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

    const resultado = await mlAtualizarPrecoSeguro(itemId, precoNovo, ctx);
    if (!resultado.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: resultado.erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { erro: resultado.erro, preco_novo: precoNovo, lote: true },
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
        preco_novo: precoNovo,
        age_group_corrigido: resultado.ageGroupCorrigido,
        preco_minimo_seguro: floorPorItemId.get(itemId) ?? null,
        furou_minimo: floorPorItemId.get(itemId) != null && precoNovo < (floorPorItemId.get(itemId) as number),
        lote: true,
      },
    });
  }

  return NextResponse.json({ ok: true, preco: precoNovo, resultados });
}
