/**
 * GET /api/seller/gestores-ia — última rodada de cada gestor pro seller autenticado (hoje:
 * estoque_fulfillment e anuncios_seo). Gate por plano Pro (isPro), igual ao cron que
 * submete o batch (gestorBatchSubmit.ts).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
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

  const { data: sellerPlano, error: planoErr } = await supabaseAdmin
    .from("sellers")
    .select("plano")
    .eq("id", seller.id)
    .maybeSingle();
  if (planoErr) {
    console.error("[seller/gestores-ia GET]", planoErr.message);
    return NextResponse.json({ error: "Erro ao carregar plano do seller." }, { status: 500 });
  }

  if (!isPro({ plano: sellerPlano?.plano })) {
    return NextResponse.json({ pro: false, runs: {} });
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

  return NextResponse.json({ pro: true, runs });
}
