/**
 * Cron B dos Gestores de IA: confere os batches "pendente" em seller_ai_runs, e quando a
 * Anthropic terminou de processar (processing_status === "ended"), grava o resultado real
 * (ou erro) na linha. Batch pode levar até 24h — por isso é cron separado do que submete
 * (gestorBatchSubmit.ts), não dá pra esperar dentro da mesma invocação de função.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ProcessarBatchesResultado = {
  batches_verificados: number;
  batches_ainda_processando: number;
  linhas_atualizadas: number;
};

type LinhaPendente = { id: string; seller_id: string; batch_id: string | null };

export async function processarGestoresIaBatchesPendentes(): Promise<ProcessarBatchesResultado> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const { data: pendentesRaw, error } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("id, seller_id, batch_id")
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
    const linhaPorSeller = new Map(linhasDoBatch.map((l) => [l.seller_id, l]));

    for await (const item of await client.messages.batches.results(batchId)) {
      // custom_id é o próprio seller_id (ver gestorBatchSubmit.ts — limite de 64
      // caracteres da Batch API não sobra espaço pra mais nada junto).
      const linha = linhaPorSeller.get(item.custom_id);
      if (!linha) continue;

      if (item.result.type === "succeeded") {
        const textBlock = item.result.message.content.find((b) => b.type === "text");
        let resultado: unknown = null;
        let erroMensagem: string | null = null;
        if (!textBlock || textBlock.type !== "text") {
          erroMensagem = `Resposta do modelo sem bloco de texto (stop_reason: ${item.result.message.stop_reason ?? "?"}).`;
        } else {
          try {
            resultado = JSON.parse(textBlock.text);
          } catch {
            erroMensagem = "Resposta do modelo não veio em JSON válido.";
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
      } else {
        const motivo =
          item.result.type === "errored"
            ? item.result.error.error?.message ?? "Erro na Batch API."
            : `Rodada ${item.result.type} (não processada).`;

        await supabaseAdmin
          .from("seller_ai_runs")
          .update({ status: "erro", erro_mensagem: motivo, executado_em: new Date().toISOString() })
          .eq("id", linha.id);
      }

      atualizadas += 1;
    }
  }

  return { batches_verificados: batchIds.length, batches_ainda_processando: ainda, linhas_atualizadas: atualizadas };
}
