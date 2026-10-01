/**
 * Orçamento DIÁRIO real (R$) do chat do Tiago Silva **+ das rodadas diárias dos outros 4
 * gestores** (Diogo/Andrey/Amanda/Ulisses, Batch API) — decisão original do briefing era o
 * R$120/mês cobrir os dois juntos, não só o chat. Bloqueia assim que o gasto total de hoje
 * atinge `TETO_CHAT_TIAGO_REAIS_DIA`, libera de novo à meia-noite (horário de Brasília).
 * Calculado por agregação read-only (`seller_ai_chat_mensagens` + `seller_ai_runs`, tokens já
 * gravados em ambas) — não precisa de coluna/contador novo no banco, o corte por data já é o
 * reset. Rodada em chave própria do seller (`origem_chave = 'byok'`) não conta — não é custo
 * do DropCore.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calcularCustoReais,
  calcularCustoReaisBatchGestor,
  calcularCustoReaisSonnetSemDesconto,
  TETO_CHAT_TIAGO_REAIS_DIA,
} from "./gestorTiagoChatCusto";

/** Início do dia em BRT (UTC-3), convertido pro instante UTC equivalente. */
export function inicioDoDiaBrtEmUtcIso(): string {
  const agoraUtc = new Date();
  const agoraBrt = new Date(agoraUtc.getTime() - 3 * 60 * 60 * 1000);
  const inicioMs = Date.UTC(agoraBrt.getUTCFullYear(), agoraBrt.getUTCMonth(), agoraBrt.getUTCDate(), 3, 0, 0, 0);
  return new Date(inicioMs).toISOString();
}

/** Data (YYYY-MM-DD) em BRT de um instante ISO qualquer — genérico, serve tanto pro "agora"
 * (`hojeBrtIso`) quanto pra checar se uma sessão de chat foi criada hoje ou em outro dia. */
export function dataBrtDeIso(iso: string): string {
  const brt = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    brt.getUTCDate()
  ).padStart(2, "0")}`;
}

/** Data (YYYY-MM-DD) de hoje em BRT — usada pra comparar com
 * `gestor_mestre_chat_credito_extra_dia_ref` (crédito extra expira no mesmo dia) e pra saber
 * se a sessão de chat mais recente é de hoje ou precisa virar uma nova (ver
 * `historico/route.ts`). */
export function hojeBrtIso(): string {
  return dataBrtDeIso(new Date().toISOString());
}

/** Crédito extra comprado via PIX ainda válido hoje (0 se nunca comprou ou se foi comprado
 * em outro dia — não acumula, ver docs/SCHEMA.md). */
export async function creditoExtraValidoHojeReais(sellerId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("sellers")
    .select("gestor_mestre_chat_credito_extra_reais, gestor_mestre_chat_credito_extra_dia_ref")
    .eq("id", sellerId)
    .maybeSingle();
  if (!data || data.gestor_mestre_chat_credito_extra_dia_ref !== hojeBrtIso()) return 0;
  return Number(data.gestor_mestre_chat_credito_extra_reais ?? 0);
}

/** Teto de hoje = cota diária fixa + crédito extra válido (se tiver comprado hoje). */
export async function tetoHojeReais(sellerId: string): Promise<number> {
  const creditoExtra = await creditoExtraValidoHojeReais(sellerId);
  return TETO_CHAT_TIAGO_REAIS_DIA + creditoExtra;
}

/** Soma o custo real (R$) de todas as respostas do Tiago pra esse seller desde a meia-noite
 * (BRT) de hoje, em qualquer sessão. Usa `calcularCustoReais` com os tokens já gravados por
 * mensagem — não conta o detalhe fino de cache (não gravado por mensagem), então pode
 * subestimar um pouco o custo real; aceitável pro gate (erro é sempre a favor do seller). */
export async function gastoChatHojeReais(sellerId: string): Promise<number> {
  const { data: sessoes } = await supabaseAdmin
    .from("seller_ai_chat_sessions")
    .select("id")
    .eq("seller_id", sellerId);
  const idsSessoes = (sessoes ?? []).map((s) => s.id as string);
  if (idsSessoes.length === 0) return 0;

  const { data: mensagens } = await supabaseAdmin
    .from("seller_ai_chat_mensagens")
    .select("tokens_input, tokens_output")
    .in("session_id", idsSessoes)
    .eq("role", "assistant")
    .gte("criado_em", inicioDoDiaBrtEmUtcIso());

  return (mensagens ?? []).reduce(
    (acc, m) => acc + calcularCustoReais({ input_tokens: m.tokens_input ?? 0, output_tokens: m.tokens_output ?? 0 }),
    0
  );
}

/** Soma o custo real (R$) das rodadas de hoje dos outros gestores (Diogo/Andrey/Amanda/
 * Ulisses) — `seller_ai_runs.tokens_input/output`, só `origem_chave = 'casa'` (BYOK é custo
 * do próprio seller, não do DropCore). Desconto de 50% da Batch API só se aplica quando a
 * linha realmente passou pela Batch API (`batch_id` não nulo) — a resposta a pergunta da
 * Amanda é síncrona mesmo vindo do cron diário, e não tem desconto (achado 2026-10-01: usar
 * o desconto pra toda linha indistintamente subestimava o custo real dessa rodada). */
export async function gastoGestoresHojeReais(sellerId: string): Promise<number> {
  const { data: runs } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("tokens_input, tokens_output, batch_id")
    .eq("seller_id", sellerId)
    .eq("origem_chave", "casa")
    .gte("executado_em", inicioDoDiaBrtEmUtcIso());

  return (runs ?? []).reduce((acc, r) => {
    const tokensInput = r.tokens_input ?? 0;
    const tokensOutput = r.tokens_output ?? 0;
    const custo = r.batch_id
      ? calcularCustoReaisBatchGestor(tokensInput, tokensOutput)
      : calcularCustoReaisSonnetSemDesconto(tokensInput, tokensOutput);
    return acc + custo;
  }, 0);
}

/** Gasto total de hoje (chat + rodadas dos gestores) — é isso que conta pro teto diário
 * compartilhado, não só o chat sozinho (ver comentário no topo do arquivo). */
export async function gastoHojeReais(sellerId: string): Promise<number> {
  const [chat, gestores] = await Promise.all([gastoChatHojeReais(sellerId), gastoGestoresHojeReais(sellerId)]);
  return chat + gestores;
}
