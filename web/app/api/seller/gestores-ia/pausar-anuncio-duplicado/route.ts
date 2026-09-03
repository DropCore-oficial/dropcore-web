/**
 * POST /api/seller/gestores-ia/pausar-anuncio-duplicado — Andrey pausa de verdade o lado
 * mais fraco de um par de anúncios duplicados (mesmo produto, título muito parecido, o
 * outro com mais venda). Pausa TODAS as variações do grupo fraco (item_ids), não só o
 * representante — senão as outras variações continuam ativas competindo do mesmo jeito.
 * Reaproveita `mlAtualizarStatus` (mesma escrita já testada ao vivo pro Diogo).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import { getValidMercadoLivreAccessToken, mlBuscarItensDetalhe, mlAtualizarStatus } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { item_ids?: string[] };
  const itemIds = (body.item_ids ?? []).map((id) => id.trim()).filter(Boolean);
  if (itemIds.length === 0) {
    return NextResponse.json({ error: "item_ids é obrigatório." }, { status: 400 });
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
    return NextResponse.json({ error: "Conecte o Mercado Livre pra executar essa ação." }, { status: 422 });
  }

  const itens = await mlBuscarItensDetalhe(itemIds, ctx);
  const itensDoSeller = itens.filter((i) => String(i.seller_id) === ctx.mlUserId);
  if (itensDoSeller.length === 0) {
    return NextResponse.json({ error: "Esses anúncios não pertencem à sua conta do Mercado Livre." }, { status: 403 });
  }

  // Defesa em profundidade: o front já esconde o botão nesses casos, mas checa de novo aqui
  // contra o dado mais fresco possível — pausar Full prende estoque + cobra taxa de "item
  // parado"; pausar com oferta ativa interrompe uma promoção convertendo agora.
  const itemFull = itensDoSeller.find((i) => i.shipping?.logistic_type === "fulfillment");
  if (itemFull) {
    return NextResponse.json(
      { error: `"${itemFull.title}" usa Mercado Envios Full — pausar prende o estoque no centro de distribuição do ML. Revise manualmente.` },
      { status: 409 }
    );
  }
  const itemComOferta = itensDoSeller.find((i) => (i.deal_ids ?? []).length > 0);
  if (itemComOferta) {
    return NextResponse.json(
      { error: `"${itemComOferta.title}" tem uma promoção ativa agora — pausar interrompe a promoção no meio. Revise manualmente.` },
      { status: 409 }
    );
  }

  const resultados = await Promise.all(
    itensDoSeller.map(async (item) => {
      const resultado = await mlAtualizarStatus(item.id, "paused", ctx);
      await supabaseAdmin.from("seller_ai_acoes").insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        gestor: "anuncios_seo",
        alvo_tipo: "ml_item",
        alvo_id: item.id,
        acao: "pausar_anuncio_duplicado",
        status: resultado.ok ? "executado" : "erro",
        detalhes: resultado.ok ? { titulo: item.title } : { titulo: item.title, erro: resultado.erro },
        actor_user_id: seller.user_id ?? null,
        ip_address: getRequestIp(req),
        user_agent: req.headers.get("user-agent"),
        executado_em: new Date().toISOString(),
      });
      return { item_id: item.id, ok: resultado.ok, erro: resultado.ok ? null : resultado.erro };
    })
  );

  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === resultados.length) {
    return NextResponse.json({ error: falhas[0]?.erro ?? "Erro ao pausar os anúncios." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, resultados });
}
