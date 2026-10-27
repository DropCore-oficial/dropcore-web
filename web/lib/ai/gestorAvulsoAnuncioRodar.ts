/**
 * Lógica compartilhada pra rodar o diagnóstico do Anúncio avulso — reaproveitada pelo botão
 * manual (`app/api/gestores-ia-avulso/anuncio/rodar/route.ts`) e pelo cron diário
 * (`app/api/cron/gestores-ia-avulso-anuncio/route.ts`). Extraída em 2026-10-07 pra garantir
 * que os dois caminhos nunca ficam dessincronizados (mesmo cooldown, mesmo orçamento, mesma
 * busca de dado).
 */
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarPrompt } from "@/lib/ai/gestorPrompts";
import { MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import {
  PROMPT_ANUNCIOS_SEO,
  SCHEMA_ANUNCIOS_SEO,
  buscarDadosAnunciosSeoAvulso,
  enriquecerResultadoAnunciosSeoAvulso,
} from "@/lib/ai/gestorAnunciosSeoDadosAvulso";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, buscarAssinanteByok } from "@/lib/ai/gestorAvulsoOrcamento";

export const COOLDOWN_HORAS_ANDREY_AVULSO = 6;

export type ResultadoRodarAndreyAvulso =
  | { ok: true; runId: string }
  | { ok: false; motivo: string };

/** true quando já passou o cooldown desde a última rodada REAL (pula linhas de "Ideias pra
 * produto novo", que gravam no mesmo gestor só pra contar orçamento — ver
 * ideias-produto-novo/route.ts). Reaproveitado pelo síncrono (clique manual) e pelo batch
 * submit do cron (gestorAvulsoBatchSubmit.ts), pra nunca dessincronizar a regra. */
export async function foraDoCooldownAndreyAvulso(assinanteId: string): Promise<boolean> {
  const { data: runsRecentes } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("criado_em, resultado")
    .eq("assinante_id", assinanteId)
    .eq("gestor", "anuncios_seo")
    .order("criado_em", { ascending: false })
    .limit(10);

  const ultima = (runsRecentes ?? []).find(
    (r) => (r.resultado as { tipo?: string } | null)?.tipo !== "ideias_produto_novo"
  );
  if (!ultima) return true;

  const horasDesde = (Date.now() - new Date(ultima.criado_em).getTime()) / (1000 * 60 * 60);
  return horasDesde >= COOLDOWN_HORAS_ANDREY_AVULSO;
}

/** Roda o diagnóstico pra UM assinante — usado tanto pelo clique manual quanto pelo caminho
 * síncrono do BYOK no cron. Cooldown e orçamento são checados aqui dentro, pra nunca gastar
 * token de assinante que rodou manualmente há pouco ou já estourou o teto do dia. */
export async function rodarAndreyAvulsoParaAssinante(assinanteId: string): Promise<ResultadoRodarAndreyAvulso> {
  if (!(await foraDoCooldownAndreyAvulso(assinanteId))) {
    return { ok: false, motivo: "cooldown" };
  }

  const assinanteByok = await buscarAssinanteByok(assinanteId);
  if (!assinanteByok) {
    return { ok: false, motivo: "assinante_nao_encontrado" };
  }
  if (!(await temOrcamentoDisponivelHoje(assinanteByok, assinanteId))) {
    return { ok: false, motivo: "orcamento_estourado" };
  }

  const chaveByok = chaveByokDoAssinante(assinanteByok);
  const apiKey = chaveByok ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, motivo: "sem_api_key" };
  }

  const dados = await buscarDadosAnunciosSeoAvulso(assinanteId);
  if (dados.length === 0) {
    return { ok: false, motivo: "sem_anuncio_elegivel" };
  }

  const client = new Anthropic({ apiKey });
  let resultado: unknown;
  let erroMensagem: string | null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let webSearchRequests = 0;
  try {
    const message = await client.messages.create({
      model: MODELO_GESTORES_IA,
      max_tokens: 16384,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: SCHEMA_ANUNCIOS_SEO } },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: montarPrompt(PROMPT_ANUNCIOS_SEO, dados) }],
    });
    tokensInput = message.usage?.input_tokens ?? 0;
    tokensOutput = message.usage?.output_tokens ?? 0;
    webSearchRequests = message.usage?.server_tool_use?.web_search_requests ?? 0;
    ({ resultado, erroMensagem } = parseGestorResposta(message));
  } catch (e: unknown) {
    erroMensagem = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    resultado = null;
  }

  if (!erroMensagem && resultado) {
    // Acumulador mutado por referência dentro do enriquecimento — a Laura (análise de foto,
    // só quando o funil esgota as outras causas) soma aqui o custo real dela, pra entrar no
    // MESMO `tokens_input`/`tokens_output` dessa rodada (nunca gasto invisível pro orçamento
    // diário — ver `gestorAvulsoOrcamento.ts`).
    const acumuladorTokensLaura = { input: 0, output: 0 };
    try {
      resultado = await enriquecerResultadoAnunciosSeoAvulso(
        assinanteId,
        resultado as Parameters<typeof enriquecerResultadoAnunciosSeoAvulso>[1],
        { apiKey, assinanteByok, acumuladorTokens: acumuladorTokensLaura }
      );
      tokensInput += acumuladorTokensLaura.input;
      tokensOutput += acumuladorTokensLaura.output;
    } catch (e) {
      console.error("[gestorAvulsoAnuncioRodar] enriquecimento falhou", e);
    }
  }

  const { data: novaLinha, error: insertErr } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .insert({
      assinante_id: assinanteId,
      gestor: "anuncios_seo",
      status: erroMensagem ? "erro" : "ok",
      resultado,
      erro: erroMensagem,
      tokens_input: chaveByok ? null : tokensInput,
      tokens_output: chaveByok ? null : tokensOutput,
      web_search_requests: chaveByok ? null : webSearchRequests,
      atualizado_em: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) {
    return { ok: false, motivo: `erro_gravar: ${insertErr.message}` };
  }

  return { ok: true, runId: novaLinha.id };
}
