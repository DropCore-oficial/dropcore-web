/**
 * Lógica compartilhada pra rodar o diagnóstico do Ulisses avulso (Ads/Preço) — reaproveitada
 * pelo botão manual e pelo cron diário. 100% código, zero chamada à Anthropic (nem orçamento
 * nem BYOK entram aqui — diferente do Andrey/Amanda, o Ulisses não tem custo de IA nenhum).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarResultadoAdsAvulso } from "@/lib/ai/gestorAdsDadosAvulso";

export const COOLDOWN_HORAS_ULISSES_AVULSO = 6;

export type ResultadoRodarUlissesAvulso = { ok: true; runId: string } | { ok: false; motivo: string };

export async function foraDoCooldownUlissesAvulso(assinanteId: string): Promise<boolean> {
  const { data: ultima } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "ads")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima) return true;
  const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
  return horasDesde >= COOLDOWN_HORAS_ULISSES_AVULSO;
}

export async function rodarUlissesAvulsoParaAssinante(assinanteId: string): Promise<ResultadoRodarUlissesAvulso> {
  if (!(await foraDoCooldownUlissesAvulso(assinanteId))) {
    return { ok: false, motivo: "cooldown" };
  }

  const resultado = await montarResultadoAdsAvulso(assinanteId);
  if (!resultado) {
    return { ok: false, motivo: "sem_dado_suficiente" };
  }

  const { data: novaLinha, error: insertErr } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .insert({
      assinante_id: assinanteId,
      gestor: "ads",
      status: "ok",
      resultado,
      atualizado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) {
    return { ok: false, motivo: `erro_gravar: ${insertErr.message}` };
  }

  return { ok: true, runId: novaLinha.id };
}
