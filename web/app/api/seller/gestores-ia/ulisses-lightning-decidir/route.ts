/**
 * POST /api/seller/gestores-ia/ulisses-lightning-decidir — aceita ou recusa candidato(s) de
 * Oferta Relâmpago (Lightning) de verdade no Mercado Livre. Preço não é editável pelo seller
 * aqui (diferente de ulisses-aplicar-promocao-lote) — o ML já sugeriu o valor, a única
 * decisão é binária. "Recusar" não tem chamada de API (não existe endpoint de recusa
 * documentado, ver mercadoLivreApiClient.ts) — só marca a decisão pra auditoria/histórico.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import { getValidMercadoLivreAccessToken, mlBuscarItemTituloEstado, mlAceitarCandidatoLightning } from "@/lib/mercadoLivreApiClient";
import { buscarCandidatosLightningComMargem } from "@/lib/ai/gestorLightningDados";

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
  acao: "lightning_aceitar" | "lightning_recusar";
  status: "executado" | "erro";
  detalhes: Record<string, unknown>;
}) {
  await supabaseAdmin.from("seller_ai_acoes").insert({
    org_id: params.orgId,
    seller_id: params.sellerId,
    gestor: "ads",
    alvo_tipo: "ml_item",
    alvo_id: params.itemId,
    acao: params.acao,
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
    acao?: string;
    confirmar_abaixo_minimo?: boolean;
  };
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((id) => id.trim()).filter(Boolean) : [];
  const acao = body.acao === "aceitar" || body.acao === "recusar" ? body.acao : null;
  const confirmarAbaixoMinimo = body.confirmar_abaixo_minimo === true;
  if (itemIds.length === 0 || !acao) {
    return NextResponse.json({ error: "item_ids (lista) e acao ('aceitar'|'recusar') são obrigatórios." }, { status: 400 });
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

  // Recalcula margem no servidor sempre — nunca confia no que o front manda de volta (mesma
  // fonte que a tela usa pra sugerir aceitar/recusar).
  const candidatos = await buscarCandidatosLightningComMargem(seller.id);
  const candidatoPorItemId = new Map(candidatos.map((c) => [c.itemId, c]));

  if (acao === "recusar") {
    const resultados: { item_id: string; ok: boolean }[] = [];
    for (const itemId of itemIds) {
      resultados.push({ item_id: itemId, ok: true });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        acao: "lightning_recusar",
        status: "executado",
        detalhes: { observacao: "Recusa sem chamada de API — candidato só não foi aceito.", lote: true },
      });
    }
    return NextResponse.json({ ok: true, acao, resultados });
  }

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra decidir sobre o candidato." }, { status: 422 });
  }

  const itensAbaixoMinimo = itemIds
    .map((itemId) => candidatoPorItemId.get(itemId))
    .filter((c): c is NonNullable<typeof c> => c != null && c.margemResultantePct < c.margemMinimaPct)
    .map((c) => ({ item_id: c.itemId, margem_resultante_pct: c.margemResultantePct, margem_minima_pct: c.margemMinimaPct }));

  if (itensAbaixoMinimo.length > 0 && !confirmarAbaixoMinimo) {
    return NextResponse.json(
      {
        error: "Pelo menos 1 candidato desse lote fura a margem mínima configurada.",
        requer_confirmacao: true,
        itens_abaixo_minimo: itensAbaixoMinimo,
      },
      { status: 409 }
    );
  }

  const resultados: { item_id: string; ok: boolean; erro?: string }[] = [];

  for (const itemId of itemIds) {
    const candidato = candidatoPorItemId.get(itemId);
    if (!candidato) {
      resultados.push({ item_id: itemId, ok: false, erro: "Candidato não encontrado (pode já ter expirado ou sido decidido)." });
      continue;
    }

    const estado = await mlBuscarItemTituloEstado(itemId, ctx);
    if (!estado || String(estado.seller_id) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Anúncio não encontrado ou não pertence à sua conta." });
      continue;
    }

    const resultadoAceite = await mlAceitarCandidatoLightning(
      itemId,
      candidato.dealId,
      candidato.precoSugerido,
      candidato.precoOriginal,
      candidato.estoqueMax,
      ctx
    );
    if (!resultadoAceite.ok) {
      resultados.push({ item_id: itemId, ok: false, erro: resultadoAceite.erro });
      await registrarAcao({
        req,
        orgId: seller.org_id,
        sellerId: seller.id,
        actorUserId: seller.user_id ?? null,
        itemId,
        acao: "lightning_aceitar",
        status: "erro",
        detalhes: { erro: resultadoAceite.erro, preco_sugerido: candidato.precoSugerido, lote: true },
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
      acao: "lightning_aceitar",
      status: "executado",
      detalhes: {
        preco_sugerido: candidato.precoSugerido,
        margem_resultante_pct: candidato.margemResultantePct,
        margem_minima_pct: candidato.margemMinimaPct,
        furou_minimo: candidato.margemResultantePct < candidato.margemMinimaPct,
        offer_id: resultadoAceite.offerId,
        lote: true,
      },
    });
  }

  return NextResponse.json({ ok: true, acao, resultados });
}
