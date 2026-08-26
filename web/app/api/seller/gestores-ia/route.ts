/**
 * GET /api/seller/gestores-ia — última rodada de cada gestor pro seller autenticado (hoje:
 * estoque_fulfillment e anuncios_seo). Gate por plano Pro (isPro), igual ao cron que
 * submete o batch (gestorBatchSubmit.ts).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SellerAiRunRow = {
  id: string;
  gestor: string;
  status: string;
  resultado: unknown;
  erro_mensagem: string | null;
  executado_em: string;
};

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    console.error("[seller/gestores-ia GET]", sellerErr.message);
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }

  if (!isPro({ plano: sellerRow?.plano })) {
    return NextResponse.json({ pro: false, runs: {} });
  }

  // Gestor de IA consome API paga — sem saldo, nem mostra a tela (evita Pro zerado usando
  // de graça enquanto o preço por rodada ainda não foi fechado).
  const saldoDisponivel = Math.max(0, Number(sellerRow?.saldo_atual ?? 0));
  if (saldoDisponivel <= 0) {
    return NextResponse.json({ pro: true, saldo_suficiente: false, runs: {} });
  }

  const { data: runsRaw, error: runsErr } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("id, gestor, status, resultado, erro_mensagem, executado_em")
    .eq("seller_id", seller.id)
    .order("executado_em", { ascending: false })
    .limit(10);
  if (runsErr) {
    console.error("[seller/gestores-ia GET]", runsErr.message);
    return NextResponse.json({ error: "Erro ao carregar resultado dos gestores." }, { status: 500 });
  }

  const runs: Record<string, SellerAiRunRow> = {};
  for (const row of (runsRaw ?? []) as SellerAiRunRow[]) {
    if (!runs[row.gestor]) runs[row.gestor] = row;
  }

  // Vínculo SKU -> anúncio do ML (seller_mercadolivre_sku_map): usado pelo handoff do
  // Gestor 1 ("SKU sem venda pode ser o anúncio, não o estoque") pra linkar direto pro
  // anúncio real quando existe correspondência.
  const { data: skuMapRaw } = await supabaseAdmin
    .from("seller_mercadolivre_sku_map")
    .select("sku, ml_item_id")
    .eq("seller_id", seller.id);
  const sku_ml_map: Record<string, string> = {};
  for (const row of (skuMapRaw ?? []) as { sku: string; ml_item_id: string }[]) {
    sku_ml_map[row.sku] = row.ml_item_id;
  }

  // Feed "ao vivo" da equipe de IA: ações reais já executadas (auditoria seller_ai_acoes).
  const { data: acoesRaw } = await supabaseAdmin
    .from("seller_ai_acoes")
    .select("gestor, alvo_id, acao, status, detalhes, criado_em")
    .eq("seller_id", seller.id)
    .order("criado_em", { ascending: false })
    .limit(8);

  return NextResponse.json({ pro: true, saldo_suficiente: true, runs, sku_ml_map, acoes: acoesRaw ?? [] });
}
