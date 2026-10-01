/**
 * POST /api/seller/gestores-ia/diagnostico-anuncio — análise sob demanda de 1 anúncio
 * específico (fecha o handoff do Gestor 1: "esse SKU sem venda pode ser o anúncio, veja o
 * diagnóstico"). Diferente da rodada principal do Gestor 2 (20 piores automáticos), aqui é
 * só o anúncio que o seller pediu. O resultado é devolvido direto pra tela (não substitui a
 * rodada principal do gestor no hub) mas a rodada grava em `seller_ai_runs` com
 * `gestor: "atendimento"` (achado 2026-10-01: sem isso, essa chamada nunca contava pro teto
 * diário compartilhado e o seller podia repetir sem limite nenhum). `"atendimento"` já é
 * valor aceito pelo CHECK da tabela e nenhum card do hub lê esse gestor — não aparece em
 * lugar nenhum da UI, serve só de registro de custo real.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { gestorLiberadoPorPlano } from "@/lib/ai/gestorPerfis";
import { montarRequestAnuncioUnico, MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import { gastoHojeReais, tetoHojeReais } from "@/lib/ai/gestorTiagoChatOrcamentoDia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { sku?: string };
  const sku = body.sku?.trim();
  if (!sku) {
    return NextResponse.json({ error: "SKU obrigatório." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("plano, saldo_atual, gestores_ia_addon_ativo")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }
  if (!gestorLiberadoPorPlano("anuncios_seo", sellerRow)) {
    return NextResponse.json({ error: "Esse gestor exige o add-on Gestores de IA (ou plano Pro, no caso do Ulisses)." }, { status: 403 });
  }
  if (Math.max(0, Number(sellerRow?.saldo_atual ?? 0)) <= 0) {
    return NextResponse.json({ error: "Recarregue seu saldo pra usar os Gestores de IA." }, { status: 402 });
  }

  // Mesmo teto diário compartilhado do chat do Tiago Silva/outros gestores (ver
  // gestorTiagoChatOrcamentoDia.ts) — achado 2026-10-01: essa chamada sob demanda nunca
  // tinha limite nenhum, o seller podia repetir sem parar.
  const [gastoHoje, tetoHoje] = await Promise.all([gastoHojeReais(seller.id), tetoHojeReais(seller.id)]);
  if (gastoHoje >= tetoHoje) {
    return NextResponse.json({ error: "Limite diário de uso da IA atingido. Tente de novo amanhã." }, { status: 429 });
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

  const params = await montarRequestAnuncioUnico(seller.id, vinculo.ml_item_id);
  if (!params) {
    return NextResponse.json({ error: "Não foi possível carregar o anúncio pra análise." }, { status: 422 });
  }

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create(params);
    const { resultado, erroMensagem } = parseGestorResposta(message);

    await supabaseAdmin.from("seller_ai_runs").insert({
      org_id: seller.org_id,
      seller_id: seller.id,
      gestor: "atendimento",
      modelo: MODELO_GESTORES_IA,
      origem_chave: "casa",
      batch_id: null,
      status: erroMensagem || !resultado ? "erro" : "ok",
      resultado: null,
      erro_mensagem: erroMensagem ?? null,
      tokens_input: message.usage?.input_tokens ?? null,
      tokens_output: message.usage?.output_tokens ?? null,
      executado_em: new Date().toISOString(),
    });

    if (erroMensagem || !resultado) {
      return NextResponse.json({ error: erroMensagem ?? "Erro ao processar a análise." }, { status: 500 });
    }
    const diagnostico = (resultado as { anuncios?: unknown[] }).anuncios?.[0] ?? null;
    return NextResponse.json({ ok: true, ml_item_id: vinculo.ml_item_id, diagnostico });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
