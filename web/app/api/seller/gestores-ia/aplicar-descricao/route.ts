/**
 * POST /api/seller/gestores-ia/aplicar-descricao — Andrey escreve a descrição sugerida em
 * 1 ou mais anúncios do Mercado Livre (PUT /items/{id}/description). Diferente do título,
 * a descrição não tem trava de família nem de venda (testado ao vivo) — por isso aqui a
 * gente aplica em TODOS os item_ids do grupo de uma vez, não só no representante. Cada
 * item vira uma linha própria em seller_ai_acoes (sucesso ou erro).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import { getValidMercadoLivreAccessToken, mlBuscarItemDono, mlAtualizarDescricao } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ITENS_POR_CHAMADA = 50;

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
    gestor: "anuncios_seo",
    alvo_tipo: "ml_item",
    alvo_id: params.itemId,
    acao: "aplicar_descricao",
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

  const body = (await req.json().catch(() => ({}))) as { item_ids?: string[]; descricao_nova?: string };
  const itemIds = (body.item_ids ?? []).map((id) => id.trim()).filter(Boolean);
  const descricaoNova = body.descricao_nova?.trim();
  if (itemIds.length === 0 || !descricaoNova) {
    return NextResponse.json({ error: "item_ids e descricao_nova são obrigatórios." }, { status: 400 });
  }
  if (itemIds.length > MAX_ITENS_POR_CHAMADA) {
    return NextResponse.json({ error: `Máximo de ${MAX_ITENS_POR_CHAMADA} anúncios por vez.` }, { status: 400 });
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
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar a descrição." }, { status: 422 });
  }

  const resultados: { item_id: string; ok: boolean; erro?: string }[] = [];
  for (const itemId of itemIds) {
    const dono = await mlBuscarItemDono(itemId, ctx);
    if (!dono || String(dono.sellerId) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Esse anúncio não pertence à sua conta do Mercado Livre." });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { motivo: "dono_invalido", descricao_nova: descricaoNova },
      });
      continue;
    }

    const escrita = await mlAtualizarDescricao(itemId, descricaoNova, ctx);
    if (!escrita.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: escrita.erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        status: "erro",
        detalhes: { erro: escrita.erro, descricao_nova: descricaoNova },
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
      detalhes: { descricao_nova: descricaoNova },
    });
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  return NextResponse.json({ ok: sucesso > 0, sucesso, total: itemIds.length, resultados });
}
