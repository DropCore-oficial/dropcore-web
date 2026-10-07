/**
 * POST /api/gestores-ia-avulso/andrey/aplicar-titulo — Andrey escreve de fato o título
 * sugerido no anúncio do Mercado Livre (PUT /items/{id}), mesma regra do hub: o ML trava
 * essa escrita quando o item tem família (variantes) ou já teve alguma venda.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarItemTituloEstado, mlAtualizarTitulo } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { item_id?: string; titulo_novo?: string };
  const itemId = body.item_id?.trim();
  const tituloNovo = body.titulo_novo?.trim();
  if (!itemId || !tituloNovo) {
    return NextResponse.json({ error: "item_id e titulo_novo são obrigatórios." }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
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
    return NextResponse.json({ error: motivo, bloqueado: true }, { status: 409 });
  }

  const resultado = await mlAtualizarTitulo(itemId, tituloNovo, ctx);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  return NextResponse.json({ ok: true, titulo: tituloNovo });
}
