/**
 * POST /api/seller/gestores-ia/alterar-status-anuncio — Diogo pausa (ou reativa) de
 * verdade o anúncio de um SKU em risco. Diferente do Andrey (que trabalha direto com
 * item_id do ML), o Diogo trabalha com SKU interno — resolve o item_id via
 * seller_mercadolivre_sku_map antes de escrever.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { getRequestIp } from "@/lib/requestIp";
import { getValidMercadoLivreAccessToken, mlAtualizarStatus } from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { sku?: string; status?: "paused" | "active" };
  const sku = body.sku?.trim();
  const status = body.status;
  if (!sku || (status !== "paused" && status !== "active")) {
    return NextResponse.json({ error: "sku e status ('paused' ou 'active') são obrigatórios." }, { status: 400 });
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

  const { data: vinculo } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("ml_item_id")
    .eq("seller_id", seller.id)
    .eq("sku", sku)
    .maybeSingle();
  if (!vinculo?.ml_item_id) {
    return NextResponse.json({ error: "Esse SKU não tem anúncio vinculado no Mercado Livre." }, { status: 404 });
  }

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre pra executar essa ação." }, { status: 422 });
  }

  const acao = status === "paused" ? "pausar_anuncio" : "reativar_anuncio";
  const resultado = await mlAtualizarStatus(vinculo.ml_item_id, status, ctx);

  await supabaseAdmin.from("seller_ai_acoes").insert({
    org_id: seller.org_id,
    seller_id: seller.id,
    gestor: "estoque_fulfillment",
    alvo_tipo: "ml_item",
    alvo_id: vinculo.ml_item_id,
    acao,
    status: resultado.ok ? "executado" : "erro",
    detalhes: resultado.ok ? { sku } : { sku, erro: resultado.erro },
    actor_user_id: seller.user_id ?? null,
    ip_address: getRequestIp(req),
    user_agent: req.headers.get("user-agent"),
    executado_em: new Date().toISOString(),
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ml_item_id: vinculo.ml_item_id, status });
}
