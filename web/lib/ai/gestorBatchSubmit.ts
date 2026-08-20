/**
 * Cron A dos Gestores de IA: monta 1 request por seller elegível e submete via Batch API
 * da Anthropic (desconto de 50%, assíncrono — até 24h pra processar). NÃO lê o resultado
 * aqui, só grava a linha "pendente" em seller_ai_runs; o cron B (gestorBatchResultado.ts)
 * é quem confere se terminou e grava o resultado de verdade.
 *
 * Billing: creditos_debitados fica null por enquanto — o valor real de 1 crédito no ledger
 * ainda não foi validado (item em aberto no briefing), não vou inventar um número aqui.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPro } from "@/lib/planos";
import {
  PROMPT_RISCO_RUPTURA_FULFILLMENT,
  SCHEMA_RISCO_RUPTURA_FULFILLMENT,
  montarPrompt,
} from "./gestorPrompts";
import { buscarDadosRupturaFulfillment } from "./gestorRupturaFulfillmentDados";

const MODELO = "claude-sonnet-5";

export type SubmeterGestoresResultado = {
  sellers_elegiveis: number;
  sellers_sem_dado: number;
  batch_id: string | null;
};

type SellerElegivel = { id: string; org_id: string; plano: string | null };

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
  const pendentes: Array<{ org_id: string; seller_id: string }> = [];
  let semDado = 0;

  for (const seller of elegiveis) {
    const dados = await buscarDadosRupturaFulfillment(seller.id);
    if (dados.length === 0) {
      semDado += 1;
      continue;
    }

    requests.push({
      // custom_id tem limite de 64 caracteres na Batch API — seller_id (uuid, 36) sozinho
      // já identifica a linha em gestorBatchResultado.ts, sem precisar de gestor/data juntos.
      custom_id: seller.id,
      params: {
        model: MODELO,
        // 8192 em vez de 4096: com maioria de SKUs até 96 (maior catálogo hoje), o JSON
        // pode passar de 4096 mesmo com acao_recomendada curta — dobrar dá margem sem
        // custo relevante (Batch API já é 50% mais barata).
        max_tokens: 8192,
        // Desligado de propósito: é classificação sobre dado que já mandamos pronto, não
        // precisa de raciocínio — com thinking ligado (padrão do Sonnet 5) o budget de
        // max_tokens pode se esgotar em "pensar" antes de emitir o JSON final.
        thinking: { type: "disabled" },
        output_config: {
          format: { type: "json_schema", schema: SCHEMA_RISCO_RUPTURA_FULFILLMENT },
        },
        messages: [
          { role: "user", content: montarPrompt(PROMPT_RISCO_RUPTURA_FULFILLMENT, dados) },
        ],
      },
    });
    pendentes.push({ org_id: seller.org_id, seller_id: seller.id });
  }

  if (requests.length === 0) {
    return { sellers_elegiveis: elegiveis.length, sellers_sem_dado: semDado, batch_id: null };
  }

  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.create({ requests });

  const { error: insertErr } = await supabaseAdmin.from("seller_ai_runs").insert(
    pendentes.map((p) => ({
      org_id: p.org_id,
      seller_id: p.seller_id,
      gestor: "estoque_fulfillment",
      modelo: MODELO,
      origem_chave: "casa",
      batch_id: batch.id,
      status: "pendente",
    }))
  );
  if (insertErr) throw new Error(insertErr.message);

  return { sellers_elegiveis: elegiveis.length, sellers_sem_dado: semDado, batch_id: batch.id };
}
