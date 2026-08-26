/**
 * POST /api/seller/gestores-ia/aplicar-resposta-pergunta — Amanda responde de fato uma
 * pergunta pré-venda no Mercado Livre (POST /answers). O seller pode editar o texto
 * sugerido antes de aplicar — o que for enviado no body é o que vai pro comprador, não
 * necessariamente a sugestão original da IA. Toda tentativa vira linha em
 * seller_ai_acoes (mesmo padrão de auditoria do Andrey/Diogo).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarPerguntaEstado,
  mlResponderPergunta,
} from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function registrarAcao(params: {
  req: Request;
  orgId: string;
  sellerId: string;
  actorUserId: string | null;
  perguntaId: number;
  status: "executado" | "erro";
  detalhes: Record<string, unknown>;
}) {
  await supabaseAdmin.from("seller_ai_acoes").insert({
    org_id: params.orgId,
    seller_id: params.sellerId,
    gestor: "reputacao",
    alvo_tipo: "ml_pergunta",
    alvo_id: String(params.perguntaId),
    acao: "aplicar_resposta_pergunta",
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

  const body = (await req.json().catch(() => ({}))) as { pergunta_id?: number; resposta?: string };
  const perguntaId = body.pergunta_id;
  const resposta = body.resposta?.trim();
  if (!perguntaId || !resposta) {
    return NextResponse.json({ error: "pergunta_id e resposta são obrigatórios." }, { status: 400 });
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
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      perguntaId,
      status: "erro",
      detalhes: { motivo: "ja_respondida_ou_indisponivel", status_ml: estado.status, resposta },
    });
    return NextResponse.json({ error: "Essa pergunta já foi respondida ou não está mais disponível." }, { status: 409 });
  }

  const resultado = await mlResponderPergunta(perguntaId, resposta, ctx);
  if (!resultado.ok) {
    await registrarAcao({
      req,
      orgId: seller.org_id,
      sellerId: seller.id,
      actorUserId: seller.user_id ?? null,
      perguntaId,
      status: "erro",
      detalhes: { erro: resultado.erro, resposta },
    });
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  await registrarAcao({
    req,
    orgId: seller.org_id,
    sellerId: seller.id,
    actorUserId: seller.user_id ?? null,
    perguntaId,
    status: "executado",
    detalhes: { resposta },
  });

  return NextResponse.json({ ok: true });
}
