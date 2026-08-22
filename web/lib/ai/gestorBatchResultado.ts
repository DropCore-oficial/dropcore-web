/**
 * Cron B dos Gestores de IA: confere os batches "pendente" em seller_ai_runs, e quando a
 * Anthropic terminou de processar (processing_status === "ended"), grava o resultado real
 * (ou erro) na linha. Batch pode levar até 24h — por isso é cron separado do que submete
 * (gestorBatchSubmit.ts), não dá pra esperar dentro da mesma invocação de função.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enriquecerResultadoRuptura } from "./gestorRupturaFulfillmentDados";
import { notificarSellerGestorConcluido } from "./gestorNotificacao";
import type { GestorId } from "./gestorPrompts";
import { customIdGestorSeller } from "./gestorBatchSubmit";
import { parseGestorResposta } from "./gestorParseResposta";

export type ProcessarBatchesResultado = {
  batches_verificados: number;
  batches_ainda_processando: number;
  linhas_atualizadas: number;
};

type LinhaPendente = { id: string; seller_id: string; gestor: string; batch_id: string | null };

export async function processarGestoresIaBatchesPendentes(): Promise<ProcessarBatchesResultado> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const { data: pendentesRaw, error } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("id, seller_id, gestor, batch_id")
    .eq("status", "pendente")
    .not("batch_id", "is", null);
  if (error) throw new Error(error.message);

  const pendentes = (pendentesRaw ?? []) as LinhaPendente[];
  const batchIds = Array.from(new Set(pendentes.map((p) => p.batch_id).filter((v): v is string => !!v)));

  const client = new Anthropic({ apiKey });
  let ainda = 0;
  let atualizadas = 0;

  for (const batchId of batchIds) {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") {
      ainda += 1;
      continue;
    }

    const linhasDoBatch = pendentes.filter((p) => p.batch_id === batchId);
    // custom_id é "${seller_id}__${gestor}" (customIdGestorSeller) — precisa dos dois porque
    // um mesmo seller pode ter mais de um gestor pendente no mesmo batch.
    const linhaPorCustomId = new Map(
      linhasDoBatch.map((l) => [customIdGestorSeller(l.seller_id, l.gestor as GestorId), l])
    );

    for await (const item of await client.messages.batches.results(batchId)) {
      const linha = linhaPorCustomId.get(item.custom_id);
      if (!linha) continue;

      if (item.result.type === "succeeded") {
        let { resultado, erroMensagem } = parseGestorResposta(item.result.message);

        // Enriquecimento pós-IA (código puro, não gasta token): dias até ruptura, pedido
        // aguardando estoque, fornecedor e comparação com a rodada anterior — só faz
        // sentido pro gestor de estoque, os outros ficam com o resultado cru da IA.
        if (!erroMensagem && resultado && linha.gestor === "estoque_fulfillment") {
          try {
            resultado = await enriquecerResultadoRuptura(
              linha.seller_id,
              resultado as Parameters<typeof enriquecerResultadoRuptura>[1]
            );
          } catch (e) {
            console.error("[gestorBatchResultado] enriquecimento ruptura falhou", e);
          }
        }

        await supabaseAdmin
          .from("seller_ai_runs")
          .update({
            status: erroMensagem ? "erro" : "ok",
            resultado,
            erro_mensagem: erroMensagem,
            executado_em: new Date().toISOString(),
          })
          .eq("id", linha.id);

        await notificarSellerGestorConcluido(
          linha.seller_id,
          linha.gestor as GestorId,
          erroMensagem ? "erro" : "ok"
        );
      } else {
        const motivo =
          item.result.type === "errored"
            ? item.result.error.error?.message ?? "Erro na Batch API."
            : `Rodada ${item.result.type} (não processada).`;

        await supabaseAdmin
          .from("seller_ai_runs")
          .update({ status: "erro", erro_mensagem: motivo, executado_em: new Date().toISOString() })
          .eq("id", linha.id);

        await notificarSellerGestorConcluido(linha.seller_id, linha.gestor as GestorId, "erro");
      }

      atualizadas += 1;
    }
  }

  return { batches_verificados: batchIds.length, batches_ainda_processando: ainda, linhas_atualizadas: atualizadas };
}
