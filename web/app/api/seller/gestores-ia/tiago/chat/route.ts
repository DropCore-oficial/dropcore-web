/**
 * POST /api/seller/gestores-ia/tiago/chat — chat síncrono com o Tiago Silva (Gestor
 * Mestre). Chamada direta da Messages API (não Batch — Batch não serve pra chat ao vivo).
 * Tool-calling só lê `seller_ai_runs` via executarToolTiago (nunca dispara rodada nova).
 *
 * Sem streaming de verdade nesta v1 (token a token) — o loop de tool-calling teria que
 * multiplexar várias chamadas da API num streaming só pro cliente, complexidade real que
 * ficou pra depois; aqui é síncrono (espera a resposta final, inclusive depois de rodar
 * tool) e devolve tudo de uma vez. UX: mostrar "Tiago está digitando…" enquanto espera.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { gestoresIaSellerPermitido } from "@/lib/ai/gestoresIaAcesso";
import { temAddonGestoresIaAtivo } from "@/lib/planos";
import { montarSystemTiago, TIAGO_TOOLS_COM_CACHE } from "@/lib/ai/gestorTiagoChatPrompt";
import { executarToolTiago, criarOrcamentoResultadoChat } from "@/lib/ai/gestorTiagoChatTools";
import {
  calcularCustoReais,
  estimarCustoReaisAntesDaChamada,
  TETO_CHAT_TIAGO_REAIS_MES,
  MODELO_CHAT_TIAGO,
  type UsoAnthropic,
} from "@/lib/ai/gestorTiagoChatCusto";
import { gastoHojeReais, tetoHojeReais } from "@/lib/ai/gestorTiagoChatOrcamentoDia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MENSAGEM_CHARS = 4000;
const MAX_ITERACOES_TOOL = 4;
const MAX_TOKENS_RESPOSTA = 1024;

type HistoricoResposta = {
  mensagens?: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!gestoresIaSellerPermitido(seller.id)) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { session_id?: string; mensagem?: string };
  const sessionId = body.session_id?.trim();
  const mensagem = body.mensagem?.trim();
  if (!sessionId || !mensagem) {
    return NextResponse.json({ error: "session_id e mensagem são obrigatórios." }, { status: 400 });
  }
  if (mensagem.length > MAX_MENSAGEM_CHARS) {
    return NextResponse.json({ error: `Mensagem muito longa (máx ${MAX_MENSAGEM_CHARS} caracteres).` }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("plano, gestores_ia_addon_ativo, nome_responsavel")
    .eq("id", seller.id)
    .maybeSingle();
  if (sellerErr) {
    return NextResponse.json({ error: "Erro ao carregar dados do seller." }, { status: 500 });
  }
  if (!temAddonGestoresIaAtivo(sellerRow)) {
    return NextResponse.json({ error: "O chat com o Tiago Silva exige o add-on Gestores de IA." }, { status: 403 });
  }

  const [gastoHoje, tetoHoje] = await Promise.all([gastoHojeReais(seller.id), tetoHojeReais(seller.id)]);
  if (gastoHoje >= tetoHoje) {
    return NextResponse.json(
      {
        error: "Cota diária do chat esgotada por hoje — libera de novo à meia-noite ou compre mais crédito.",
        bloqueado_hoje: true,
      },
      { status: 402 }
    );
  }

  const { data: historicoRaw, error: histErr } = await supabaseAdmin.rpc("fn_seller_ai_chat_historico", {
    p_seller_id: seller.id,
    p_session_id: sessionId,
  });
  if (histErr) {
    return NextResponse.json({ error: histErr.message }, { status: 400 });
  }
  const historico = (historicoRaw as HistoricoResposta | null)?.mensagens ?? [];

  const mensagensConversa: Anthropic.Messages.MessageParam[] = historico.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  mensagensConversa.push({ role: "user", content: mensagem });

  const systemBlocks = montarSystemTiago(sellerRow?.nome_responsavel ?? null);
  const caracteresPrompt =
    systemBlocks.reduce((acc, b) => acc + ("text" in b ? b.text.length : 0), 0) +
    JSON.stringify(TIAGO_TOOLS_COM_CACHE).length +
    mensagensConversa.reduce(
      (acc, m) => acc + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length),
      0
    );
  const custoEstimado = estimarCustoReaisAntesDaChamada(caracteresPrompt, MAX_TOKENS_RESPOSTA);

  const { data: reserva, error: reservaErr } = await supabaseAdmin.rpc("fn_seller_ai_chat_orcamento_reservar", {
    p_seller_id: seller.id,
    p_custo_estimado: custoEstimado,
    p_teto: TETO_CHAT_TIAGO_REAIS_MES,
  });
  if (reservaErr) {
    return NextResponse.json({ error: reservaErr.message }, { status: 500 });
  }
  const reservaTyped = reserva as { ok?: boolean; usado?: number } | null;
  if (reservaTyped?.ok !== true) {
    const usado = Number(reservaTyped?.usado ?? 0);
    return NextResponse.json(
      {
        error: `Orçamento mensal do chat esgotado (R$ ${usado.toFixed(2)} de R$ ${TETO_CHAT_TIAGO_REAIS_MES.toFixed(2)} usados). Volta a liberar no início do próximo mês.`,
      },
      { status: 402 }
    );
  }

  const client = new Anthropic({ apiKey });
  const usoTotal: Required<UsoAnthropic> = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  let textoFinal = "";
  const orcamentoResultado = criarOrcamentoResultadoChat();

  try {
    for (let i = 0; i < MAX_ITERACOES_TOOL; i++) {
      const resposta = await client.messages.create({
        model: MODELO_CHAT_TIAGO,
        max_tokens: MAX_TOKENS_RESPOSTA,
        system: systemBlocks,
        tools: TIAGO_TOOLS_COM_CACHE,
        thinking: { type: "disabled" },
        messages: mensagensConversa,
      });

      usoTotal.input_tokens += resposta.usage.input_tokens;
      usoTotal.output_tokens += resposta.usage.output_tokens;
      usoTotal.cache_creation_input_tokens += resposta.usage.cache_creation_input_tokens ?? 0;
      usoTotal.cache_read_input_tokens += resposta.usage.cache_read_input_tokens ?? 0;

      if (resposta.stop_reason !== "tool_use") {
        textoFinal = resposta.content
          .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      mensagensConversa.push({ role: "assistant", content: resposta.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        const resultado = await executarToolTiago(
          bloco.name,
          bloco.input as Record<string, unknown>,
          seller.id,
          orcamentoResultado
        );
        toolResults.push({ type: "tool_result", tool_use_id: bloco.id, content: resultado });
      }
      mensagensConversa.push({ role: "user", content: toolResults });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!textoFinal) {
    textoFinal = "Não consegui concluir a resposta agora — tenta de novo em alguns segundos.";
  }

  const custoReal = calcularCustoReais(usoTotal);
  await supabaseAdmin.rpc("fn_seller_ai_chat_orcamento_conciliar", {
    p_seller_id: seller.id,
    p_custo_estimado: custoEstimado,
    p_custo_real: custoReal,
  });

  await supabaseAdmin.rpc("fn_seller_ai_chat_gravar_mensagem", {
    p_session_id: sessionId,
    p_role: "user",
    p_content: mensagem,
  });
  await supabaseAdmin.rpc("fn_seller_ai_chat_gravar_mensagem", {
    p_session_id: sessionId,
    p_role: "assistant",
    p_content: textoFinal,
    p_tokens_input: usoTotal.input_tokens,
    p_tokens_output: usoTotal.output_tokens,
  });

  return NextResponse.json({ ok: true, resposta: textoFinal });
}
