/**
 * Cron B do Andrey avulso: confere os batches "pendente" em `calculadora_assinante_ai_runs` e,
 * quando a Anthropic terminou de processar (processing_status === "ended"), grava o resultado
 * real (ou erro) na linha — mesmo padrão do hub (gestorBatchResultado.ts). Batch pode levar
 * até 24h, por isso é cron separado do que submete (gestorAvulsoBatchSubmit.ts).
 *
 * Cada batch_id pode pertencer à chave da casa (vários assinantes juntos) ou a uma chave BYOK
 * (1 assinante só, ver gestorAvulsoBatchSubmit.ts) — precisa consultar a Batch API com a
 * MESMA chave que criou o batch, senão a Anthropic não acha/não deixa ler.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseGestorResposta } from "./gestorParseResposta";
import { enriquecerResultadoAnunciosSeoAvulso } from "./gestorAnunciosSeoDadosAvulso";
import { chaveByokDoAssinante, type AssinanteByok } from "./gestorAvulsoOrcamento";

export type ProcessarAndreyAvulsoBatchesResultado = {
  batches_verificados: number;
  batches_ainda_processando: number;
  linhas_atualizadas: number;
};

type LinhaPendente = { id: string; assinante_id: string; batch_id: string | null };

export async function processarAndreyAvulsoBatchesPendentes(): Promise<ProcessarAndreyAvulsoBatchesResultado> {
  const apiKeyCasa = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKeyCasa) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const { data: pendentesRaw, error } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("id, assinante_id, batch_id")
    .eq("gestor", "anuncios_seo")
    .eq("status", "pendente")
    .not("batch_id", "is", null);
  if (error) throw new Error(error.message);

  const pendentes = (pendentesRaw ?? []) as LinhaPendente[];
  const batchIds = Array.from(new Set(pendentes.map((p) => p.batch_id).filter((v): v is string => !!v)));

  const assinanteIds = Array.from(new Set(pendentes.map((p) => p.assinante_id)));
  const { data: assinantesRaw } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("id, anthropic_api_key_encriptada")
    .in("id", assinanteIds);
  const byokPorAssinante = new Map(
    (assinantesRaw ?? []).map((a) => [
      a.id as string,
      chaveByokDoAssinante({ anthropic_api_key_encriptada: a.anthropic_api_key_encriptada } as AssinanteByok),
    ])
  );

  let ainda = 0;
  let atualizadas = 0;

  for (const batchId of batchIds) {
    const linhasDoBatch = pendentes.filter((p) => p.batch_id === batchId);
    // Batch BYOK sempre tem 1 assinante só (ver gestorAvulsoBatchSubmit.ts) — se a chave dele
    // tiver configurada, é essa chave que criou o batch, não a da casa.
    const chaveByokDoBatch = byokPorAssinante.get(linhasDoBatch[0]?.assinante_id) ?? null;
    const client = new Anthropic({ apiKey: chaveByokDoBatch ?? apiKeyCasa });

    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") {
      ainda += 1;
      continue;
    }

    // custom_id é o próprio assinante_id (ver gestorAvulsoBatchSubmit.ts — só 1 gestor no
    // avulso hoje, sem precisar do sufixo "__gestor" que o hub usa).
    const linhaPorCustomId = new Map(linhasDoBatch.map((l) => [l.assinante_id, l]));

    for await (const item of await client.messages.batches.results(batchId)) {
      const linha = linhaPorCustomId.get(item.custom_id);
      if (!linha) continue;

      if (item.result.type === "succeeded") {
        const parsed = parseGestorResposta(item.result.message);
        let resultado = parsed.resultado;
        const erroMensagem = parsed.erroMensagem;

        if (!erroMensagem && resultado) {
          try {
            resultado = await enriquecerResultadoAnunciosSeoAvulso(
              linha.assinante_id,
              resultado as Parameters<typeof enriquecerResultadoAnunciosSeoAvulso>[1]
            );
          } catch (e) {
            console.error("[gestorAvulsoBatchResultado] enriquecimento falhou", e);
          }
        }

        const usage = item.result.message.usage;
        // BYOK não grava custo (chave própria, não é gasto do DropCore) — mesmo princípio do
        // caminho síncrono em gestorAvulsoAndreyRodar.ts.
        const ehByok = chaveByokDoBatch !== null;

        await supabaseAdmin
          .from("calculadora_assinante_ai_runs")
          .update({
            status: erroMensagem ? "erro" : "ok",
            resultado,
            erro: erroMensagem,
            tokens_input: ehByok ? null : usage?.input_tokens ?? null,
            tokens_output: ehByok ? null : usage?.output_tokens ?? null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", linha.id);
      } else {
        const motivo =
          item.result.type === "errored"
            ? item.result.error.error?.message ?? "Erro na Batch API."
            : `Rodada ${item.result.type} (não processada).`;

        await supabaseAdmin
          .from("calculadora_assinante_ai_runs")
          .update({ status: "erro", erro: motivo, atualizado_em: new Date().toISOString() })
          .eq("id", linha.id);
      }

      atualizadas += 1;
    }
  }

  return { batches_verificados: batchIds.length, batches_ainda_processando: ainda, linhas_atualizadas: atualizadas };
}
