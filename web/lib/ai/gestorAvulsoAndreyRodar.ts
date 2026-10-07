/**
 * Lógica compartilhada pra rodar o diagnóstico do Andrey avulso — reaproveitada pelo botão
 * manual (`app/api/gestores-ia-avulso/andrey/rodar/route.ts`) e pelo cron diário
 * (`app/api/cron/gestores-ia-avulso-andrey/route.ts`). Extraída em 2026-10-07 pra garantir
 * que os dois caminhos nunca ficam dessincronizados (mesmo cooldown, mesmo orçamento, mesma
 * busca de dado).
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarPrompt } from "@/lib/ai/gestorPrompts";
import { MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import {
  PROMPT_ANUNCIOS_SEO,
  SCHEMA_ANUNCIOS_SEO,
  buscarDadosAnunciosSeoAvulso,
  enriquecerResultadoAnunciosSeoAvulso,
} from "@/lib/ai/gestorAnunciosSeoDadosAvulso";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, type AssinanteByok } from "@/lib/ai/gestorAvulsoOrcamento";

export const COOLDOWN_HORAS_ANDREY_AVULSO = 6;

export type ResultadoRodarAndreyAvulso =
  | { ok: true; runId: string }
  | { ok: false; motivo: string };

/** Roda o diagnóstico pra UM assinante — usado tanto pelo clique manual quanto pelo cron.
 * Cooldown e orçamento são checados aqui dentro (não no cron), pra nunca gastar token de
 * assinante que rodou manualmente há pouco ou já estourou o teto do dia. */
export async function rodarAndreyAvulsoParaAssinante(assinanteId: string): Promise<ResultadoRodarAndreyAvulso> {
  const { data: ultima } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "anuncios_seo")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultima) {
    const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
    if (horasDesde < COOLDOWN_HORAS_ANDREY_AVULSO) {
      return { ok: false, motivo: "cooldown" };
    }
  }

  const { data: assinanteByok } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("anthropic_api_key_encriptada")
    .eq("id", assinanteId)
    .maybeSingle<AssinanteByok>();
  if (!assinanteByok) {
    return { ok: false, motivo: "assinante_nao_encontrado" };
  }
  if (!(await temOrcamentoDisponivelHoje(assinanteByok, assinanteId))) {
    return { ok: false, motivo: "orcamento_estourado" };
  }

  const chaveByok = chaveByokDoAssinante(assinanteByok);
  const apiKey = chaveByok ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, motivo: "sem_api_key" };
  }

  const dados = await buscarDadosAnunciosSeoAvulso(assinanteId);
  if (dados.length === 0) {
    return { ok: false, motivo: "sem_anuncio_elegivel" };
  }

  const client = new Anthropic({ apiKey });
  let resultado: unknown;
  let erroMensagem: string | null;
  let tokensInput = 0;
  let tokensOutput = 0;
  try {
    const message = await client.messages.create({
      model: MODELO_GESTORES_IA,
      max_tokens: 16384,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
      messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, dados) }],
    });
    tokensInput = message.usage?.input_tokens ?? 0;
    tokensOutput = message.usage?.output_tokens ?? 0;
    ({ resultado, erroMensagem } = parseGestorResposta(message));
  } catch (e: unknown) {
    erroMensagem = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    resultado = null;
  }

  if (!erroMensagem && resultado) {
    try {
      resultado = await enriquecerResultadoAnunciosSeoAvulso(
        assinanteId,
        resultado as Parameters<typeof enriquecerResultadoAnunciosSeoAvulso>[1]
      );
    } catch (e) {
      console.error("[gestorAvulsoAndreyRodar] enriquecimento falhou", e);
    }
  }

  const { data: novaLinha, error: insertErr } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .insert({
      assinante_id: assinanteId,
      gestor: "anuncios_seo",
      status: erroMensagem ? "erro" : "ok",
      resultado,
      erro: erroMensagem,
      tokens_input: chaveByok ? null : tokensInput,
      tokens_output: chaveByok ? null : tokensOutput,
      atualizado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) {
    return { ok: false, motivo: `erro_gravar: ${insertErr.message}` };
  }

  return { ok: true, runId: novaLinha.id };
}
