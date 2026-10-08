/**
 * POST /api/gestores-ia-avulso/amanda/aplicar-resposta-pergunta — Amanda avulsa responde de
 * fato uma pergunta pré-venda no Mercado Livre (POST /answers). O assinante pode editar o
 * texto sugerido antes de aplicar. Mesmo padrão do hub
 * (app/api/seller/gestores-ia/aplicar-resposta-pergunta/route.ts), sem a auditoria em
 * `seller_ai_acoes` — essa tabela é do hub (seller/org), o avulso ainda não tem equivalente.
 */
import { NextResponse } from "next/server";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarPerguntaEstado, mlResponderPergunta } from "@/lib/mercadoLivreApiClient";

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

  const body = (await req.json().catch(() => ({}))) as { pergunta_id?: number; resposta?: string };
  const perguntaId = body.pergunta_id;
  const resposta = body.resposta?.trim();
  if (!perguntaId || !resposta) {
    return NextResponse.json({ error: "pergunta_id e resposta são obrigatórios." }, { status: 400 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra responder a pergunta." }, { status: 422 });
  }

  const estado = await mlBuscarPerguntaEstado(perguntaId, ctx);
  if (!estado) {
    return NextResponse.json({ error: "Não foi possível consultar a pergunta no Mercado Livre." }, { status: 502 });
  }
  if (String(estado.sellerId) !== ctx.mlUserId) {
    return NextResponse.json({ error: "Essa pergunta não pertence à sua conta do Mercado Livre." }, { status: 403 });
  }
  if (estado.status !== "UNANSWERED") {
    return NextResponse.json({ error: "Essa pergunta já foi respondida ou não está mais disponível." }, { status: 409 });
  }

  const resultado = await mlResponderPergunta(perguntaId, resposta, ctx);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
