/**
 * POST /api/gestores-ia-avulso/andrey/aplicar-descricao — Andrey escreve a descrição
 * sugerida em 1 ou mais anúncios do grupo (PUT /items/{id}/description). Sem trava de
 * família nem de venda (mesmo comportamento confirmado no hub) — aplica em todos os
 * item_ids de uma vez.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarItemDono, mlAtualizarDescricao } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ITENS_POR_CHAMADA = 50;

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { item_ids?: string[]; descricao_nova?: string };
  const itemIds = (body.item_ids ?? []).map((id) => id.trim()).filter(Boolean);
  const descricaoNova = body.descricao_nova?.trim();
  if (itemIds.length === 0 || !descricaoNova) {
    return NextResponse.json({ error: "item_ids e descricao_nova são obrigatórios." }, { status: 400 });
  }
  if (itemIds.length > MAX_ITENS_POR_CHAMADA) {
    return NextResponse.json({ error: `Máximo de ${MAX_ITENS_POR_CHAMADA} anúncios por vez.` }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar a descrição." }, { status: 422 });
  }

  const resultados: { item_id: string; ok: boolean; erro?: string }[] = [];
  for (const itemId of itemIds) {
    const dono = await mlBuscarItemDono(itemId, ctx);
    if (!dono || String(dono.sellerId) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Esse anúncio não pertence à sua conta do Mercado Livre." });
      continue;
    }

    const escrita = await mlAtualizarDescricao(itemId, descricaoNova, ctx);
    if (!escrita.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: escrita.erro });
      continue;
    }

    resultados.push({ item_id: itemId, ok: true });
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: sucesso > 0, sucesso, total: itemIds.length, resultados });
}
