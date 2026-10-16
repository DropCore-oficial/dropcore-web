/**
 * POST /api/gestores-ia-avulso/ulisses/aplicar-promocao-lote — porte da ação que já existe
 * no hub (`app/api/seller/gestores-ia/ulisses-aplicar-promocao-lote/route.ts`): inscreve um
 * lote de item_ids (todos os membros de 1 família) numa promoção `PRICE_DISCOUNT` de verdade
 * no Mercado Livre (`mlCriarPromocaoPrecoDesconto`), não é só reescrever `price`. Token do
 * assinante avulso (`getValidMercadoLivreAvulsoAccessToken`), não o do seller do hub.
 *
 * Sem auditoria em tabela — avulso não tem `seller_ai_acoes` (tabela só do hub), mesmo
 * precedente da Amanda/Estoque avulso.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import {
  mlBuscarItemTituloEstado,
  mlBuscarLimitesPromocaoPrecoDesconto,
  mlCriarPromocaoPrecoDesconto,
} from "@/lib/mercadoLivreApiClient";
import { montarResultadoAdsAvulso } from "@/lib/ai/gestorAdsDadosAvulso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITENS_POR_LOTE = 30;

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
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
  if (
    itemIds.length === 0 ||
    typeof precoPromocional !== "number" ||
    !Number.isFinite(precoPromocional) ||
    precoPromocional <= 0
  ) {
    return NextResponse.json(
      { error: "item_ids (lista) e preco_promocional (número > 0) são obrigatórios." },
      { status: 400 }
    );
  }
  if (itemIds.length > MAX_ITENS_POR_LOTE) {
    return NextResponse.json({ error: `No máximo ${MAX_ITENS_POR_LOTE} itens por lote.` }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar a promoção." }, { status: 422 });
  }

  // Preço mínimo seguro é lógica de negócio — nunca confiar no que o front manda de volta,
  // recalcula aqui (mesma fonte que a tela usa pra sugerir o valor). O piso é por família
  // (chave), então mapeia cada item_id membro pro piso da família a que ele pertence.
  const resultado = await montarResultadoAdsAvulso(assinante.id);
  const floorPorItemId = new Map<string, number | null>();
  for (const s of resultado?.skus ?? []) {
    for (const m of s.membros) floorPorItemId.set(m.item_id, s.preco_minimo_seguro);
  }

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
      resultados.push({
        item_id: itemId,
        ok: false,
        erro: `O Mercado Livre só aceita entre R$ ${limites.min.toFixed(2)} e R$ ${limites.max.toFixed(2)} pra esse item.`,
      });
      continue;
    }

    const resultadoCriacao = await mlCriarPromocaoPrecoDesconto(itemId, precoPromocional, ctx);
    if (!resultadoCriacao.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: resultadoCriacao.erro });
      continue;
    }

    resultados.push({ item_id: itemId, ok: true });
  }

  return NextResponse.json({ ok: true, preco: precoPromocional, resultados });
}
