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
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { isPro } from "@/lib/planos";
import type { GestorId } from "@/lib/ai/gestorPrompts";
import { MODELO_GESTORES_IA, montarRequestAnunciosSeo } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import { enriquecerResultadoAnunciosSeo } from "@/lib/ai/gestorAnunciosSeoDados";
import { montarResultadoReputacao } from "@/lib/ai/gestorReputacaoAtendimentoDados";
import { montarResultadoAds } from "@/lib/ai/gestorAdsDados";
import { montarResultadoRuptura } from "@/lib/ai/gestorRupturaFulfillmentDados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COOLDOWN_HORAS = 6;
const GESTORES_VALIDOS: GestorId[] = ["estoque_fulfillment", "anuncios_seo", "reputacao", "ads"];
/** Gestores que não chamam a Anthropic — diagnóstico e recomendação são código puro (ver
 * gestorAdsDados.ts / gestorRupturaFulfillmentDados.ts). */
const GESTORES_SEM_IA: GestorId[] = ["ads", "estoque_fulfillment"];

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { gestor?: string };
  const gestor = body.gestor as GestorId | undefined;
  if (!gestor || !GESTORES_VALIDOS.includes(gestor)) {
    return NextResponse.json({ error: "Gestor inválido." }, { status: 400 });
  }

  const semIa = GESTORES_SEM_IA.includes(gestor);
  const apiKey = semIa ? null : process.env.ANTHROPIC_API_KEY?.trim();
  if (!semIa && !apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }
  if (!isPro({ plano: sellerRow?.plano })) {
    return NextResponse.json({ error: "Gestores de IA são exclusivos do plano Pro." }, { status: 403 });
  }
  if (Math.max(0, Number(sellerRow?.saldo_atual ?? 0)) <= 0) {
    return NextResponse.json({ error: "Recarregue seu saldo pra usar os Gestores de IA." }, { status: 402 });
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

  if (semIa) {
    const resultado = gestor === "ads" ? await montarResultadoAds(seller.id) : await montarResultadoRuptura(seller.id);
    const semDado = !resultado || (gestor === "estoque_fulfillment" && (resultado as { skus: unknown[] }).skus.length === 0);
    if (semDado) {
      return NextResponse.json({ error: "Sem dado suficiente pra rodar esse gestor agora." }, { status: 422 });
    }
    const { data: novaLinha, error: insertErr } = await supabaseAdmin
      .from("seller_ai_runs")
      .insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        gestor,
        modelo: "codigo-deterministico",
        // Coluna é NOT NULL com check ('casa'|'byok') — não tem valor "não se aplica" pra
        // quando não usou nenhuma chave (achado real: insert falhava com null antes desse
        // fix). "casa" é o mais correto dos dois enums existentes aqui.
        origem_chave: "casa",
        batch_id: null,
        status: "ok",
        resultado,
        erro_mensagem: null,
        executado_em: new Date().toISOString(),
      })
      .select("id, status, resultado, erro_mensagem, executado_em")
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, run: novaLinha });
  }

  // Reputação: diagnóstico é código puro, só chama a Anthropic se houver pergunta pendente
  // de verdade (ver montarResultadoReputacao) — por isso não passa pelo pipeline genérico
  // de request/parse abaixo, que é só pro Andrey (anuncios_seo) agora.
  if (gestor === "reputacao") {
    const resultado = await montarResultadoReputacao(seller.id, apiKey as string);
    if (!resultado) {
      return NextResponse.json({ error: "Sem dado suficiente pra rodar esse gestor agora." }, { status: 422 });
    }
    const chamouIa = resultado.perguntas.some((p) => p.resposta_sugerida);
    const { data: novaLinha, error: insertErr } = await supabaseAdmin
      .from("seller_ai_runs")
      .insert({
        org_id: seller.org_id,
        seller_id: seller.id,
        gestor,
        modelo: chamouIa ? MODELO_GESTORES_IA : "codigo-deterministico",
        origem_chave: "casa",
        batch_id: null,
        status: "ok",
        resultado,
        erro_mensagem: null,
        executado_em: new Date().toISOString(),
      })
      .select("id, status, resultado, erro_mensagem, executado_em")
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, run: novaLinha });
  }

  const params = await montarRequestAnunciosSeo(seller.id);
  if (!params) {
    return NextResponse.json({ error: "Sem dado suficiente pra rodar esse gestor agora." }, { status: 422 });
  }

  const client = new Anthropic({ apiKey: apiKey as string });
  let resultado: unknown;
  let erroMensagem: string | null;
  try {
    const message = await client.messages.create(params);
    ({ resultado, erroMensagem } = parseGestorResposta(message));
  } catch (e: unknown) {
    erroMensagem = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    resultado = null;
  }

  if (!erroMensagem && resultado && gestor === "anuncios_seo") {
    try {
      resultado = await enriquecerResultadoAnunciosSeo(
        seller.id,
        resultado as Parameters<typeof enriquecerResultadoAnunciosSeo>[1]
      );
    } catch (e) {
      console.error("[gestores-ia/rodar] enriquecimento anúncios falhou", e);
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
