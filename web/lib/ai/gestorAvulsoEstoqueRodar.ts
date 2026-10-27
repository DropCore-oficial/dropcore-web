/**
 * Lógica compartilhada pra rodar o diagnóstico do Estoque avulso — reaproveitada pelo botão
 * manual e pelo cron diário. 100% código, zero chamada à Anthropic (réplica do Diogo do
 * hub) — mas ainda assim respeita o orçamento diário compartilhado da equipe, mesmo
 * princípio do Ulisses avulso: quando o pote do dia esgota por causa de outro gestor, o
 * Estoque pausa junto, não porque ele mesmo gaste token.
 *
 * Única diferença estrutural dos 3 irmãos (Andrey/Amanda/Ulisses): este é o 1º gestor
 * avulso escrito depois da regra 9 do CLAUDE.md (2026-10-07) — usa só RPC `SECURITY
 * DEFINER`, nunca `.from()` direto nas tabelas `calculadora_assinante_ai_runs`/
 * `_assinantes`.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarResultadoEstoqueAvulso } from "@/lib/ai/gestorEstoqueDadosAvulso";
import { temOrcamentoDisponivelHojeComByokBooleano } from "@/lib/ai/gestorAvulsoOrcamento";

export const COOLDOWN_HORAS_ESTOQUE_AVULSO = 6;

export type ResultadoRodarEstoqueAvulso = { ok: true; runId: string } | { ok: false; motivo: string };

type RunRecenteRow = { criado_em: string };

export async function foraDoCooldownEstoqueAvulso(assinanteId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_runs_recentes", {
    p_assinante_id: assinanteId,
    p_gestor: "estoque",
    p_limit: 1,
  });
  const ultima = ((data ?? []) as RunRecenteRow[])[0];
  if (!ultima) return true;
  const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
  return horasDesde >= COOLDOWN_HORAS_ESTOQUE_AVULSO;
}

export async function rodarEstoqueAvulsoParaAssinante(assinanteId: string): Promise<ResultadoRodarEstoqueAvulso> {
  if (!(await foraDoCooldownEstoqueAvulso(assinanteId))) {
    return { ok: false, motivo: "cooldown" };
  }

  const { data: byokConfigurado, error: byokErr } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_byok_anthropic_configurado", {
    p_assinante_id: assinanteId,
  });
  if (byokErr) {
    return { ok: false, motivo: "assinante_nao_encontrado" };
  }
  if (!(await temOrcamentoDisponivelHojeComByokBooleano(Boolean(byokConfigurado), assinanteId))) {
    return { ok: false, motivo: "orcamento_estourado" };
  }

  const resultado = await montarResultadoEstoqueAvulso(assinanteId);
  if (!resultado) {
    return { ok: false, motivo: "sem_dado_suficiente" };
  }

  const { data: runId, error: insertErr } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_ai_run_insert", {
    p_assinante_id: assinanteId,
    p_gestor: "estoque",
    p_status: "ok",
    p_resultado: resultado,
  });
  if (insertErr || !runId) {
    return { ok: false, motivo: `erro_gravar: ${insertErr?.message ?? "desconhecido"}` };
  }

  return { ok: true, runId: runId as string };
}
