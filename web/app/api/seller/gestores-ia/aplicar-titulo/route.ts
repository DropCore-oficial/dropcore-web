/**
 * POST /api/seller/gestores-ia/aplicar-titulo — Andrey escreve de fato o título sugerido no
 * anúncio do Mercado Livre (PUT /items/{id}). O ML trava essa escrita quando o item tem
 * família (variantes) ou já teve alguma venda — nesses casos devolvemos 409 sem tentar
 * escrever. Toda tentativa (bloqueada, aplicada ou com erro do ML) vira uma linha em
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
  mlAtualizarTitulo,
} from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    acao: "aplicar_titulo",
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

  const body = (await req.json().catch(() => ({}))) as { item_id?: string; titulo_novo?: string };
  const itemId = body.item_id?.trim();
  const tituloNovo = body.titulo_novo?.trim();
  if (!itemId || !tituloNovo) {
    return NextResponse.json({ error: "item_id e titulo_novo são obrigatórios." }, { status: 400 });
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
    return NextResponse.json({ error: "Conecte o Mercado Livre pra aplicar o título." }, { status: 422 });
  }

  const estado = await mlBuscarItemTituloEstado(itemId, ctx);
  if (!estado) {
    return NextResponse.json({ error: "Não foi possível consultar o anúncio no Mercado Livre." }, { status: 502 });
  }
  if (String(estado.seller_id) !== ctx.mlUserId) {
    return NextResponse.json({ error: "Esse anúncio não pertence à sua conta do Mercado Livre." }, { status: 403 });
  }

  if (estado.family_name || estado.sold_quantity > 0) {
    const motivo = estado.family_name
      ? "Esse anúncio faz parte de uma família de variantes — o Mercado Livre não permite editar o título por essa via."
      : "Esse anúncio já teve venda — o Mercado Livre trava a edição de título depois da primeira venda.";
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      itemId,
      status: "erro",
      detalhes: { motivo, family_name: estado.family_name, sold_quantity: estado.sold_quantity, titulo_novo: tituloNovo },
    });
    return NextResponse.json({ error: motivo, bloqueado: true }, { status: 409 });
  }

  const resultado = await mlAtualizarTitulo(itemId, tituloNovo, ctx);
  if (!resultado.ok) {
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      itemId,
      status: "erro",
      detalhes: { erro: resultado.erro, titulo_novo: tituloNovo },
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
    detalhes: { titulo_anterior: estado.title, titulo_novo: tituloNovo },
  });

  return NextResponse.json({ ok: true, titulo: tituloNovo });
}
