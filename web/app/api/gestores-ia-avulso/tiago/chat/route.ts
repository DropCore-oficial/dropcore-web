/**
 * POST /api/gestores-ia-avulso/tiago/chat — chat com o Tiago Silva (Gestor Mestre) avulso,
 * streaming token-a-token (NDJSON), mesmo padrão do hub
 * (app/api/seller/gestores-ia/tiago/chat/route.ts). Tool-calling só lê
 * `calculadora_assinante_ai_runs` via executarToolTiagoAvulso (nunca dispara rodada nova).
 *
 * Orçamento: diferente do hub (reserva-e-concilia atômico com lock de linha), o avulso faz
 * uma checagem simples antes de chamar (mesmo padrão síncrono do Andrey/Amanda avulso) — o
 * teto é o pote diário COMPARTILHADO (`gastoAvulsoHojeReais`, que já soma chat + gestores).
 * Custo do chat (Haiku) é gravado só em `calculadora_assinante_ai_chat_mensagens`, nunca em
 * `calculadora_assinante_ai_runs` (que é Sonnet-priced) — ver gestorAvulsoOrcamento.ts.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { montarSystemTiagoAvulso, TIAGO_TOOLS_AVULSO_COM_CACHE } from "@/lib/ai/gestorTiagoChatPromptAvulso";
import { executarToolTiagoAvulso, criarOrcamentoResultadoChat, nomeGestorConsultavelAvulso } from "@/lib/ai/gestorTiagoChatToolsAvulso";
import { MODELO_CHAT_TIAGO, type UsoAnthropic } from "@/lib/ai/gestorTiagoChatCusto";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, type AssinanteByok } from "@/lib/ai/gestorAvulsoOrcamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MENSAGEM_CHARS = 4000;
const MAX_ITERACOES_TOOL = 4;
const MAX_TOKENS_RESPOSTA = 1024;

type HistoricoResposta = { mensagens?: { role: "user" | "assistant"; content: string }[] };

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
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

  const { data: assinanteByok } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("anthropic_api_key_encriptada")
    .eq("id", assinante.id)
    .maybeSingle<AssinanteByok>();
  if (!assinanteByok) {
    return NextResponse.json({ error: "Erro ao carregar orçamento." }, { status: 500 });
  }
  const chaveByok = chaveByokDoAssinante(assinanteByok);

  if (!chaveByok && !(await temOrcamentoDisponivelHoje(assinanteByok, assinante.id))) {
    return NextResponse.json(
      {
        error: "Cota diária dos Gestores de IA esgotada por hoje — libera de novo à meia-noite.",
        bloqueado_hoje: true,
      },
      { status: 402 }
    );
  }

  const apiKey = chaveByok ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const { data: historicoRaw, error: histErr } = await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_historico", {
    p_assinante_id: assinante.id,
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

  const systemBlocks = montarSystemTiagoAvulso();

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(evento: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n"));
      }

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
          const msgStream = client.messages.stream({
            model: MODELO_CHAT_TIAGO,
            max_tokens: MAX_TOKENS_RESPOSTA,
            system: systemBlocks,
            tools: TIAGO_TOOLS_AVULSO_COM_CACHE,
            thinking: { type: "disabled" },
            messages: mensagensConversa,
          });
          msgStream.on("text", (delta) => send({ type: "delta", text: delta }));

          const resposta = await msgStream.finalMessage();

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
            const nomeGestor =
              bloco.name === "consultar_gestor"
                ? nomeGestorConsultavelAvulso(String((bloco.input as Record<string, unknown>)?.gestor ?? ""))
                : null;
            send({ type: "tool_status", label: nomeGestor ? `Consultando o ${nomeGestor}…` : "Consultando a equipe…" });
            const resultado = await executarToolTiagoAvulso(
              bloco.name,
              bloco.input as Record<string, unknown>,
              assinante.id,
              orcamentoResultado
            );
            toolResults.push({ type: "tool_result", tool_use_id: bloco.id, content: resultado });
          }
          mensagensConversa.push({ role: "user", content: toolResults });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
        send({ type: "error", error: msg });
        controller.close();
        return;
      }

      if (!textoFinal) {
        textoFinal = "Não consegui concluir a resposta agora — tenta de novo em alguns segundos.";
      }

      // BYOK não grava custo (chave própria, não é gasto do DropCore) — mesmo princípio do
      // Andrey/Amanda/Ulisses avulso.
      await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_gravar_mensagem", {
        p_session_id: sessionId,
        p_role: "user",
        p_content: mensagem,
      });
      await supabaseAdmin.rpc("fn_calculadora_assinante_ai_chat_gravar_mensagem", {
        p_session_id: sessionId,
        p_role: "assistant",
        p_content: textoFinal,
        p_tokens_input: chaveByok ? null : usoTotal.input_tokens,
        p_tokens_output: chaveByok ? null : usoTotal.output_tokens,
      });

      send({ type: "done", resposta: textoFinal });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
