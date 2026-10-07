/**
 * Orçamento DIÁRIO (R$) dos Gestores de IA avulso — mesmo padrão do chat do Tiago Silva no
 * hub (`gestorTiagoChatOrcamentoDia.ts`): bloqueia quando o gasto real de hoje atinge o
 * teto, libera de novo à meia-noite (BRT). Calculado por agregação read-only a partir dos
 * tokens já gravados em `calculadora_assinante_ai_runs` — sem acumulador separado, sem risco
 * de drift. Compartilhado entre TODOS os gestores avulso (hoje só o Andrey; Amanda/Ulisses/
 * Tiago entram no mesmo pote quando forem construídos), igual o hub compartilha entre chat +
 * os 4 gestores diários.
 *
 * BYOK (`anthropic_api_key_encriptada`): se configurado, o teto não vale — gasto sai 100% da
 * chave do assinante, não é custo do DropCore.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptCalculadoraAssinanteSecret } from "@/lib/calculadoraAssinanteSecretBox";
import {
  calcularCustoReaisSonnetSemDesconto,
  calcularCustoReaisWebSearch,
  TETO_CHAT_TIAGO_REAIS_DIA,
  TOKENS_POR_REAL_ESTIMADO,
} from "./gestorTiagoChatCusto";
import { inicioDoDiaBrtEmUtcIso } from "./gestorTiagoChatOrcamentoDia";

export { calcularCustoReaisSonnetSemDesconto };

/** Mesmo teto diário do chat do Tiago Silva (R$120/mês ÷ 30) — fonte única do número, nunca
 * duplicar o valor cru aqui. */
export const TETO_AVULSO_REAIS_DIA = TETO_CHAT_TIAGO_REAIS_DIA;

/** Cota diária "equivalente" em tokens, só pra exibição (barra de % + tokens, sem R$ na
 * tela) — mesmo princípio de `COTA_TOKENS_DIA_ESTIMADA` do chat do Tiago. */
export const COTA_TOKENS_DIA_ESTIMADA_AVULSO = Math.round((TETO_AVULSO_REAIS_DIA * TOKENS_POR_REAL_ESTIMADO) / 1000) * 1000;

export type AssinanteByok = { anthropic_api_key_encriptada: string | null };

/** Chave BYOK configurada pelo assinante, descriptografada — null se não configurou. */
export function chaveByokDoAssinante(assinante: AssinanteByok): string | null {
  if (!assinante.anthropic_api_key_encriptada) return null;
  try {
    return decryptCalculadoraAssinanteSecret(assinante.anthropic_api_key_encriptada);
  } catch {
    return null;
  }
}

/** Soma o custo real (R$) de todas as rodadas (qualquer gestor avulso) desde a meia-noite
 * (BRT) de hoje — mesmo princípio de `gastoGestoresHojeReais` do hub. */
export async function gastoAvulsoHojeReais(assinanteId: string): Promise<number> {
  const { data: runs } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("tokens_input, tokens_output, web_search_requests")
    .eq("assinante_id", assinanteId)
    .gte("criado_em", inicioDoDiaBrtEmUtcIso());

  return (runs ?? []).reduce(
    (acc, r) =>
      acc +
      calcularCustoReaisSonnetSemDesconto(Number(r.tokens_input ?? 0), Number(r.tokens_output ?? 0)) +
      calcularCustoReaisWebSearch(Number(r.web_search_requests ?? 0)),
    0
  );
}

/** true quando ainda há orçamento pra rodar sem BYOK hoje (ou quando BYOK está configurado,
 * caso em que o teto nem se aplica). */
export async function temOrcamentoDisponivelHoje(assinante: AssinanteByok, assinanteId: string): Promise<boolean> {
  if (chaveByokDoAssinante(assinante) !== null) return true;
  const gastoHoje = await gastoAvulsoHojeReais(assinanteId);
  return gastoHoje < TETO_AVULSO_REAIS_DIA;
}
