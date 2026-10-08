/**
 * Cron A do Andrey avulso: submete o diagnóstico diário via Anthropic Batch API (desconto de
 * 50%, assíncrono — até 24h pra processar) — mesmo padrão do hub (gestorBatchSubmit.ts). NÃO
 * lê o resultado aqui, só grava a linha "pendente" com `batch_id`;
 * gestorAvulsoBatchResultado.ts (cron B) confere quando termina.
 *
 * Assinante com BYOK também ganha o desconto, só que num batch PRÓPRIO (1 request, com a
 * chave dele) — Batch API é por client/chave, não dá pra misturar a chave da casa com a do
 * assinante numa submissão só. O desconto de 50% é da Anthropic, não depende de quem paga, só
 * de ser assíncrono — então vale a pena pro BYOK também, não só pra chave da casa.
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarRequestAnunciosSeoAvulso } from "./gestorAnunciosSeoDadosAvulso";
import { foraDoCooldownAndreyAvulso } from "./gestorAvulsoAndreyRodar";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, type AssinanteByok } from "./gestorAvulsoOrcamento";

export type SubmeterAndreyAvulsoResultado = {
  assinantes_elegiveis: number;
  byok_submetidos: Array<{ assinante_id: string; ok: boolean; motivo?: string; batch_id?: string }>;
  batch_id: string | null;
  requests_submetidos: number;
  linhas_sem_dado: number;
};

type AssinanteElegivel = { id: string; anthropic_api_key_encriptada: string | null };

export async function submeterAndreyAvulsoDiario(): Promise<SubmeterAndreyAvulsoResultado> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const { data: assinantesRaw, error } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("id, anthropic_api_key_encriptada, calculadora_assinante_mercadolivre_integrations!inner(ml_user_id)")
    .eq("inclui_gestores_ia", true);
  if (error) throw new Error(error.message);

  const assinantes = (assinantesRaw ?? []) as AssinanteElegivel[];

  const requests: Array<{ custom_id: string; params: Anthropic.Messages.MessageCreateParamsNonStreaming }> = [];
  const pendentes: string[] = [];
  const byokResultados: Array<{ assinante_id: string; ok: boolean; motivo?: string; batch_id?: string }> = [];
  let semDado = 0;

  for (const assinante of assinantes) {
    const byok: AssinanteByok = { anthropic_api_key_encriptada: assinante.anthropic_api_key_encriptada };
    const chaveByok = chaveByokDoAssinante(byok);

    if (!(await foraDoCooldownAndreyAvulso(assinante.id))) {
      if (chaveByok) byokResultados.push({ assinante_id: assinante.id, ok: false, motivo: "cooldown" });
      else semDado += 1;
      continue;
    }

    if (chaveByok === null && !(await temOrcamentoDisponivelHoje(byok, assinante.id))) {
      semDado += 1;
      continue;
    }

    const params = await montarRequestAnunciosSeoAvulso(assinante.id);
    if (!params) {
      if (chaveByok) byokResultados.push({ assinante_id: assinante.id, ok: false, motivo: "sem_anuncio_elegivel" });
      else semDado += 1;
      continue;
    }

    if (chaveByok) {
      // Batch próprio — Batch API é por client/chave, não dá pra entrar junto no batch da
      // casa. 1 request só, mas ainda ganha os 50% de desconto (o desconto é da Anthropic
      // por ser assíncrono, não depende de quem paga a chave).
      try {
        const clienteByok = new Anthropic({ apiKey: chaveByok });
        const batchByok = await clienteByok.messages.batches.create({
          requests: [{ custom_id: assinante.id, params }],
        });
        const { error: insertErr } = await supabaseAdmin.from("calculadora_assinante_ai_runs").insert({
          assinante_id: assinante.id,
          gestor: "anuncios_seo",
          status: "pendente",
          batch_id: batchByok.id,
        });
        if (insertErr) throw new Error(insertErr.message);
        byokResultados.push({ assinante_id: assinante.id, ok: true, batch_id: batchByok.id });
      } catch (e) {
        byokResultados.push({
          assinante_id: assinante.id,
          ok: false,
          motivo: e instanceof Error ? e.message : "erro_desconhecido",
        });
      }
      continue;
    }

    // custom_id só precisa do assinante_id — avulso tem só 1 gestor que chama a Anthropic
    // (Andrey), sem risco de colisão como no hub (que tem vários gestores por seller no
    // mesmo batch, ver customIdGestorSeller em gestorBatchSubmit.ts).
    requests.push({ custom_id: assinante.id, params });
    pendentes.push(assinante.id);
  }

  if (requests.length === 0) {
    return {
      assinantes_elegiveis: assinantes.length,
      byok_submetidos: byokResultados,
      batch_id: null,
      requests_submetidos: 0,
      linhas_sem_dado: semDado,
    };
  }

  const client = new Anthropic({ apiKey });
  const batch = await client.messages.batches.create({ requests });

  const { error: insertErr } = await supabaseAdmin.from("calculadora_assinante_ai_runs").insert(
    pendentes.map((assinanteId) => ({
      assinante_id: assinanteId,
      gestor: "anuncios_seo",
      status: "pendente",
      batch_id: batch.id,
    }))
  );
  if (insertErr) throw new Error(insertErr.message);

  return {
    assinantes_elegiveis: assinantes.length,
    byok_submetidos: byokResultados,
    batch_id: batch.id,
    requests_submetidos: requests.length,
    linhas_sem_dado: semDado,
  };
}
