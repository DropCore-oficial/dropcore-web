/**
 * GET /api/seller/gestores-ia/ulisses-lightning-candidatos — lista candidatos de Oferta
 * Relâmpago com margem já calculada. Diferente do resto do Ulisses, não passa por
 * seller_ai_runs/cooldown: candidato é dado vivo da API do ML (muda a qualquer momento,
 * sem custo de IA pra ler), não faz sentido prender atrás do "Rodar de novo agora".
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import { buscarCandidatosLightningComMargem } from "@/lib/ai/gestorLightningDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const { data: sellerRow } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual")
    .eq("id", seller.id)
    .maybeSingle();
  if (!isPro({ plano: sellerRow?.plano })) {
    return NextResponse.json({ candidatos: [] });
  }
  if (Math.max(0, Number(sellerRow?.saldo_atual ?? 0)) <= 0) {
    return NextResponse.json({ candidatos: [] });
  }

  try {
    const candidatos = await buscarCandidatosLightningComMargem(seller.id);
    return NextResponse.json({
      candidatos: candidatos.map((c) => ({
        item_id: c.itemId,
        deal_id: c.dealId,
        sku: c.sku,
        nome_produto: c.nomeProduto,
        custo: c.custo,
        frete_real: c.freteReal,
        preco_original: c.precoOriginal,
        preco_sugerido: c.precoSugerido,
        estoque_max: c.estoqueMax,
        margem_resultante_pct: c.margemResultantePct,
        margem_minima_pct: c.margemMinimaPct,
        recomendacao: c.recomendacao,
        permalink: c.permalink,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar candidatos.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
