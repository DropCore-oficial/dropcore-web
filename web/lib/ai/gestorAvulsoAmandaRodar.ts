/**
 * Lógica compartilhada pra rodar o diagnóstico da Amanda avulsa (Reputação & Atendimento) —
 * reaproveitada pelo botão manual e pelo cron diário. SEM Batch API, diferente do Andrey:
 * igual o hub decidiu em 2026-09-07, o diagnóstico de reputação é código puro (zero custo) e
 * só chama a Anthropic quando existe pergunta pendente de verdade — não compensa a
 * complexidade de batch assíncrono (até 24h) pra uma chamada que já é rara e barata.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buscarDadosReputacaoAtendimentoAvulso,
  montarResultadoReputacaoAtendimentoAvulso,
} from "@/lib/ai/gestorReputacaoAtendimentoDadosAvulso";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, type AssinanteByok } from "@/lib/ai/gestorAvulsoOrcamento";

export const COOLDOWN_HORAS_AMANDA_AVULSO = 6;

export type ResultadoRodarAmandaAvulso = { ok: true; runId: string } | { ok: false; motivo: string };

export async function foraDoCooldownAmandaAvulso(assinanteId: string): Promise<boolean> {
  const { data: ultima } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "reputacao_atendimento")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima) return true;
  const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
  return horasDesde >= COOLDOWN_HORAS_AMANDA_AVULSO;
}

export async function rodarAmandaAvulsoParaAssinante(assinanteId: string): Promise<ResultadoRodarAmandaAvulso> {
  if (!(await foraDoCooldownAmandaAvulso(assinanteId))) {
    return { ok: false, motivo: "cooldown" };
  }

  const { data: assinanteByok } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("anthropic_api_key_encriptada")
    .eq("id", assinanteId)
    .maybeSingle<AssinanteByok>();
  if (!assinanteByok) {
    return { ok: false, motivo: "assinante_nao_encontrado" };
  }

  const dados = await buscarDadosReputacaoAtendimentoAvulso(assinanteId);
  if (!dados) {
    return { ok: false, motivo: "sem_ml_conectado_ou_sem_reputacao" };
  }

  // Diagnóstico é grátis (código puro); só gasta token se tiver pergunta pendente de
  // verdade — por isso o orçamento só é checado nesse caso, não bloqueia o diagnóstico.
  const chaveByok = chaveByokDoAssinante(assinanteByok);
  let apiKeyParaResponder: string | null = null;
  if (dados.perguntas.length > 0) {
    if (chaveByok) {
      apiKeyParaResponder = chaveByok;
    } else if (await temOrcamentoDisponivelHoje(assinanteByok, assinanteId)) {
      apiKeyParaResponder = process.env.ANTHROPIC_API_KEY?.trim() ?? null;
    }
  }

  const { resultado, usage } = await montarResultadoReputacaoAtendimentoAvulso(dados, apiKeyParaResponder);

  const { data: novaLinha, error: insertErr } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .insert({
      assinante_id: assinanteId,
      gestor: "reputacao_atendimento",
      status: "ok",
      resultado,
      tokens_input: chaveByok ? null : (usage?.input_tokens ?? null),
      tokens_output: chaveByok ? null : (usage?.output_tokens ?? null),
      atualizado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) {
    return { ok: false, motivo: `erro_gravar: ${insertErr.message}` };
  }

  return { ok: true, runId: novaLinha.id };
}
