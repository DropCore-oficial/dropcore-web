/**
 * POST /api/seller/gestores-ia/ulisses-lightning-decidir — aceita ou recusa candidato(s) de
 * Oferta Relâmpago (Lightning) de verdade no Mercado Livre. Preço é editável (corrigido
 * 2026-09-20 — a tela do próprio ML também deixa editar antes de confirmar): aceita um
 * `preco_escolhido` opcional por item, mas sempre recalcula/limita no servidor contra a
 * faixa [min, max] que o ML reporta pro item (nunca confia no valor que o front manda) —
 * quando não vem `preco_escolhido`, usa o `precoRecomendado` que o Ulisses já calculou
 * (mais raso possível dentro da faixa, protegendo a margem). "Recusar" não tem chamada de
 * API (não existe endpoint de recusa documentado, ver mercadoLivreApiClient.ts) — só marca
 * a decisão pra auditoria/histórico.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import { getValidMercadoLivreAccessToken, mlBuscarItemTituloEstado, mlAceitarCandidatoLightning } from "@/lib/mercadoLivreApiClient";
import { buscarCandidatosLightningComMargem, calcularMargemLightningEm, limitarPrecoLightning } from "@/lib/ai/gestorLightningDados";

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
    precos?: Record<string, number>;
  };
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((id) => id.trim()).filter(Boolean) : [];
  const acao = body.acao === "aceitar" || body.acao === "recusar" ? body.acao : null;
  const confirmarAbaixoMinimo = body.confirmar_abaixo_minimo === true;
  const precosEscolhidos = body.precos && typeof body.precos === "object" ? body.precos : {};
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

  // Preço escolhido por item: o que veio do front, limitado à faixa real do ML — nunca
  // confia no valor cru do front, só usa como "intenção" e recalcula em cima da faixa e da
  // margem buscadas agora mesmo no servidor. Sem valor do front, cai pro precoRecomendado.
  const decididos = itemIds
    .map((itemId) => {
      const candidato = candidatoPorItemId.get(itemId);
      if (!candidato) return null;
      const desejado = precosEscolhidos[itemId];
      const precoEscolhido = limitarPrecoLightning(
        typeof desejado === "number" && Number.isFinite(desejado) ? desejado : candidato.precoRecomendado,
        candidato.faixaMl,
        candidato.precoOriginal,
        candidato.precoSugeridoMl
      );
      const margemNoPreco = calcularMargemLightningEm(candidato, precoEscolhido);
      return { itemId, candidato, precoEscolhido, margemNoPreco };
    })
    .filter((d): d is NonNullable<typeof d> => d != null);

  const itensAbaixoMinimo = decididos
    .filter((d) => d.margemNoPreco < d.candidato.margemMinimaPct)
    .map((d) => ({ item_id: d.itemId, margem_resultante_pct: d.margemNoPreco, margem_minima_pct: d.candidato.margemMinimaPct }));

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

  const decididoPorItemId = new Map(decididos.map((d) => [d.itemId, d]));
  const resultados: { item_id: string; ok: boolean; erro?: string }[] = [];

  for (const itemId of itemIds) {
    const decidido = decididoPorItemId.get(itemId);
    if (!decidido) {
      resultados.push({ item_id: itemId, ok: false, erro: "Candidato não encontrado (pode já ter expirado ou sido decidido)." });
      continue;
    }
    const { candidato, precoEscolhido, margemNoPreco } = decidido;

    const estado = await mlBuscarItemTituloEstado(itemId, ctx);
    if (!estado || String(estado.seller_id) !== ctx.mlUserId) {
      resultados.push({ item_id: itemId, ok: false, erro: "Anúncio não encontrado ou não pertence à sua conta." });
      continue;
    }

    const resultadoAceite = await mlAceitarCandidatoLightning(
      itemId,
      candidato.dealId,
      precoEscolhido,
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
        detalhes: { erro: resultadoAceite.erro, preco_escolhido: precoEscolhido, preco_sugerido_ml: candidato.precoSugeridoMl, lote: true },
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
        preco_escolhido: precoEscolhido,
        preco_sugerido_ml: candidato.precoSugeridoMl,
        margem_resultante_pct: margemNoPreco,
        margem_minima_pct: candidato.margemMinimaPct,
        furou_minimo: margemNoPreco < candidato.margemMinimaPct,
        offer_id: resultadoAceite.offerId,
        lote: true,
      },
    });
  }

  return NextResponse.json({ ok: true, acao, resultados });
}
