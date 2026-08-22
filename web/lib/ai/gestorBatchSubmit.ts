/**
 * Cron A dos Gestores de IA: monta 1 request por (seller, gestor) elegível e submete via
 * Batch API da Anthropic (desconto de 50%, assíncrono — até 24h pra processar). NÃO lê o
 * resultado aqui, só grava a linha "pendente" em seller_ai_runs; o cron B
 * (gestorBatchResultado.ts) é quem confere se terminou e grava o resultado de verdade.
 *
 * Billing: creditos_debitados fica null por enquanto — o valor real de 1 crédito no ledger
 * ainda não foi validado (item em aberto no briefing), não vou inventar um número aqui.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPro } from "@/lib/planos";
import type { GestorId } from "./gestorPrompts";
import { MODELO_GESTORES_IA, montarRequestEstoqueFulfillment, montarRequestAnunciosSeo } from "./gestorRequestBuilders";

export type SubmeterGestoresResultado = {
  sellers_elegiveis: number;
  linhas_sem_dado: number;
  batch_id: string | null;
  requests_submetidos: number;
};

type SellerElegivel = { id: string; org_id: string; plano: string | null };

// custom_id tem limite de 64 caracteres na Batch API E só aceita [a-zA-Z0-9_-] (sem ":").
// seller_id (uuid, 36) sozinho não basta: com 2+ gestores por seller no mesmo batch, precisa
// do nome do gestor junto pra gestorBatchResultado.ts saber em qual linha gravar cada
// resultado (bug corrigido 2026-08-20 — antes só existia 1 gestor, sem colisão). "__" como
// separador: nem uuid nem nome de gestor usam underscore duplo.
export function customIdGestorSeller(sellerId: string, gestor: GestorId): string {
  return `${sellerId}__${gestor}`;
}

export async function submeterGestoresIaDiario(): Promise<SubmeterGestoresResultado> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const { data: sellersRaw, error } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, plano")
    .eq("status", "ativo");
  if (error) throw new Error(error.message);

  const elegiveis = ((sellersRaw ?? []) as SellerElegivel[]).filter((s) => isPro({ plano: s.plano }));

  const requests: Array<{
    custom_id: string;
    params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  }> = [];
  const pendentes: Array<{ org_id: string; seller_id: string; gestor: GestorId }> = [];
  let semDado = 0;

  for (const seller of elegiveis) {
    const paramsRuptura = await montarRequestEstoqueFulfillment(seller.id);
    if (paramsRuptura) {
      requests.push({ custom_id: customIdGestorSeller(seller.id, "estoque_fulfillment"), params: paramsRuptura });
      pendentes.push({ org_id: seller.org_id, seller_id: seller.id, gestor: "estoque_fulfillment" });
    } else {
      semDado += 1;
    }

    const paramsAnuncios = await montarRequestAnunciosSeo(seller.id);
    if (paramsAnuncios) {
      requests.push({ custom_id: customIdGestorSeller(seller.id, "anuncios_seo"), params: paramsAnuncios });
      pendentes.push({ org_id: seller.org_id, seller_id: seller.id, gestor: "anuncios_seo" });
    } else {
      semDado += 1;
    }
  }

  if (requests.length === 0) {
    return { sellers_elegiveis: elegiveis.length, linhas_sem_dado: semDado, batch_id: null, requests_submetidos: 0 };
  }

  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.create({ requests });

  const { error: insertErr } = await supabaseAdmin.from("seller_ai_runs").insert(
    pendentes.map((p) => ({
      org_id: p.org_id,
      seller_id: p.seller_id,
      gestor: p.gestor,
      modelo: MODELO_GESTORES_IA,
      origem_chave: "casa",
      batch_id: batch.id,
      status: "pendente",
    }))
  );
  if (insertErr) throw new Error(insertErr.message);

  return {
    sellers_elegiveis: elegiveis.length,
    linhas_sem_dado: semDado,
    batch_id: batch.id,
    requests_submetidos: requests.length,
  };
}
