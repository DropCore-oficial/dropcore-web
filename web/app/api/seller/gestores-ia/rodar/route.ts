/**
 * POST /api/seller/gestores-ia/rodar — botão "rodar de novo agora" do seller. Diferente do
 * cron diário (gestorBatchSubmit.ts/Batch API, até 24h), aqui é chamada síncrona direta —
 * o seller espera o resultado na hora, não faz sentido usar Batch pra isso.
 * Cooldown por seller+gestor pra evitar spam/custo (o dado não muda tão rápido assim).
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { isPro } from "@/lib/planos";
import type { GestorId } from "@/lib/ai/gestorPrompts";
import { MODELO_GESTORES_IA, montarRequestEstoqueFulfillment, montarRequestAnunciosSeo } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import { enriquecerResultadoRuptura } from "@/lib/ai/gestorRupturaFulfillmentDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COOLDOWN_HORAS = 6;
const GESTORES_VALIDOS: GestorId[] = ["estoque_fulfillment", "anuncios_seo"];

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { gestor?: string };
  const gestor = body.gestor as GestorId | undefined;
  if (!gestor || !GESTORES_VALIDOS.includes(gestor)) {
    return NextResponse.json({ error: "Gestor inválido." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const { data: sellerPlano, error: planoErr } = await supabaseAdmin
    .from("sellers")
    .select("plano")
    .eq("id", seller.id)
    .maybeSingle();
  if (planoErr) {
    return NextResponse.json({ error: "Erro ao carregar plano do seller." }, { status: 500 });
  }
  if (!isPro({ plano: sellerPlano?.plano })) {
    return NextResponse.json({ error: "Gestores de IA são exclusivos do plano Pro." }, { status: 403 });
  }

  const { data: ultima } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("criado_em")
    .eq("seller_id", seller.id)
    .eq("gestor", gestor)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima) {
    const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
    if (horasDesde < COOLDOWN_HORAS) {
      const faltamHoras = Math.ceil(COOLDOWN_HORAS - horasDesde);
      return NextResponse.json(
        { error: `Aguarde ${faltamHoras}h pra rodar esse gestor de novo.` },
        { status: 429 }
      );
    }
  }

  const params =
    gestor === "estoque_fulfillment"
      ? await montarRequestEstoqueFulfillment(seller.id)
      : await montarRequestAnunciosSeo(seller.id);
  if (!params) {
    return NextResponse.json({ error: "Sem dado suficiente pra rodar esse gestor agora." }, { status: 422 });
  }

  const client = new Anthropic({ apiKey });
  let resultado: unknown;
  let erroMensagem: string | null;
  try {
    const message = await client.messages.create(params);
    ({ resultado, erroMensagem } = parseGestorResposta(message));
  } catch (e: unknown) {
    erroMensagem = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    resultado = null;
  }

  if (!erroMensagem && resultado && gestor === "estoque_fulfillment") {
    try {
      resultado = await enriquecerResultadoRuptura(
        seller.id,
        resultado as Parameters<typeof enriquecerResultadoRuptura>[1]
      );
    } catch (e) {
      console.error("[gestores-ia/rodar] enriquecimento ruptura falhou", e);
    }
  }

  const { data: novaLinha, error: insertErr } = await supabaseAdmin
    .from("seller_ai_runs")
    .insert({
      org_id: seller.org_id,
      seller_id: seller.id,
      gestor,
      modelo: MODELO_GESTORES_IA,
      origem_chave: "casa",
      batch_id: null,
      status: erroMensagem ? "erro" : "ok",
      resultado,
      erro_mensagem: erroMensagem,
      executado_em: new Date().toISOString(),
    })
    .select("id, status, resultado, erro_mensagem, executado_em")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: novaLinha });
}
