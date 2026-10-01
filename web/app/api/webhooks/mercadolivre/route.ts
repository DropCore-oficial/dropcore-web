/**
 * POST /api/webhooks/mercadolivre — recebe notificações em tempo real do Mercado Livre
 * (tópicos "questions" e "claims") pra não depender só do cron diário (07:00 UTC) ou do
 * "Rodar de novo agora" manual. Registrar no DevCenter do app "DropCore Marketplace":
 * aba Tópicos → marcar Perguntas + Reclamações → colar a URL desse endpoint no campo
 * "Callback URL de notificações" (ação que só quem tem login no DevCenter consegue fazer).
 *
 * Regra do ML: responder 200 em até 500ms, senão o tópico é desativado sozinho depois de
 * falhas repetidas — por isso o reprocessamento de verdade roda em `after()` (Next 15,
 * nativo, sem beta), depois da resposta já ter sido enviada, nunca antes.
 *
 * Nunca confia no payload pra decidir o quê mudou — só usa `user_id` pra achar o seller;
 * todo o resto (pergunta/reclamação de verdade) é buscado de novo na API do ML com nosso
 * token, igual todo outro gestor já faz. Reaproveita 100% a mesma lógica/persistência do
 * botão "Rodar de novo agora" pra Amanda (reputação) — ver app/api/seller/gestores-ia/rodar
 * — porque `montarResultadoReputacao` já detecta pergunta pendente E reclamação com
 * evidência nova na mesma chamada (ver gestorReputacaoAtendimentoDados.ts).
 *
 * Proteção de custo (2026-10-01, achado real: sem isso o webhook rodava sem parar e sem
 * respeitar orçamento): (1) checa o mesmo teto diário compartilhado do chat do Tiago Silva
 * antes de chamar a IA — nunca gasta além de R$4/dia por seller; (2) debounce de 5min — uma
 * rajada de várias perguntas/reclamações vira 1 reprocessamento só, não 1 por notificação,
 * já que `montarResultadoReputacao` já busca o backlog inteiro a cada chamada.
 */
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gestorLiberadoPorPlano } from "@/lib/ai/gestorPerfis";
import { montarResultadoReputacao } from "@/lib/ai/gestorReputacaoAtendimentoDados";
import { MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";
import { gastoHojeReais, tetoHojeReais } from "@/lib/ai/gestorTiagoChatOrcamentoDia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOPICS_RELEVANTES = new Set(["questions", "claims"]);

/** Debounce — se chegar mais de 1 notificação (pergunta ou reclamação) em rajada, não
 * reprocessa uma vez por notificação: `montarResultadoReputacao` já busca o backlog inteiro
 * de pendentes a cada chamada, então esperar essa janela cobre a rajada toda numa rodada só. */
const DEBOUNCE_MINUTOS = 5;

async function reprocessarAmandaPorMlUserId(mlUserId: string): Promise<void> {
  try {
    const { data: integ } = await supabaseAdmin
      .from("seller_mercadolivre_integrations")
      .select("seller_id")
      .eq("ml_user_id", mlUserId)
      .maybeSingle();
    if (!integ?.seller_id) return;

    const { data: sellerRow } = await supabaseAdmin
      .from("sellers")
      .select("org_id, plano, saldo_atual, gestores_ia_addon_ativo")
      .eq("id", integ.seller_id)
      .maybeSingle();
    if (!sellerRow?.org_id) return;
    if (!gestorLiberadoPorPlano("reputacao", sellerRow)) return;
    if (Math.max(0, Number(sellerRow.saldo_atual ?? 0)) <= 0) return;

    // Mesmo teto diário compartilhado do chat do Tiago Silva (ver gestorTiagoChatOrcamentoDia.ts)
    // — webhook não pode gastar sem parar e sem respeitar o orçamento do dia.
    const [gastoHoje, tetoHoje] = await Promise.all([
      gastoHojeReais(integ.seller_id),
      tetoHojeReais(integ.seller_id),
    ]);
    if (gastoHoje >= tetoHoje) return;

    const { data: ultimaRodada } = await supabaseAdmin
      .from("seller_ai_runs")
      .select("executado_em")
      .eq("seller_id", integ.seller_id)
      .eq("gestor", "reputacao")
      .order("executado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimaRodada?.executado_em) {
      const minutosDesde = (Date.now() - new Date(ultimaRodada.executado_em).getTime()) / 60000;
      if (minutosDesde < DEBOUNCE_MINUTOS) return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim() ?? null;
    const reputacao = await montarResultadoReputacao(integ.seller_id, apiKey);
    if (!reputacao) return;

    const chamouIa = reputacao.resultado.perguntas.some((p) => p.resposta_sugerida);
    await supabaseAdmin.from("seller_ai_runs").insert({
      org_id: sellerRow.org_id,
      seller_id: integ.seller_id,
      gestor: "reputacao",
      modelo: chamouIa ? MODELO_GESTORES_IA : "codigo-deterministico",
      origem_chave: "casa",
      batch_id: null,
      status: "ok",
      resultado: reputacao.resultado,
      // Achado 2026-10-01: antes não gravava tokens dessa rodada — o teto diário
      // compartilhado (gestorTiagoChatOrcamentoDia.ts) nunca via o custo real da Amanda.
      tokens_input: reputacao.usage?.input_tokens ?? null,
      tokens_output: reputacao.usage?.output_tokens ?? null,
      erro_mensagem: null,
      executado_em: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[webhook mercadolivre] erro ao reprocessar Amanda:", e);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    user_id?: number | string;
    application_id?: number | string;
    resource?: string;
  };

  const topic = String(body.topic ?? "");
  const mlUserId = String(body.user_id ?? "").trim();
  const applicationId = String(body.application_id ?? "").trim();
  const nossoClientId = process.env.MERCADOLIVRE_CLIENT_ID?.trim() ?? "";

  // Sanity check barato (não é autenticação forte — o ML não assina esse payload como o MP
  // assina o dele) — só evita gastar reprocessamento com notificação de app que não é o
  // nosso, caso a URL vaze/seja chamada por engano.
  const appConfere = !nossoClientId || !applicationId || applicationId === nossoClientId;

  if (appConfere && TOPICS_RELEVANTES.has(topic) && mlUserId) {
    after(() => reprocessarAmandaPorMlUserId(mlUserId));
  }

  return NextResponse.json({ received: true });
}
