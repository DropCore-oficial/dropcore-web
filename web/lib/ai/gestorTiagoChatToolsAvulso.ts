/**
 * Tools do Tiago Silva (Gestor Mestre) avulso — só LEITURA de `calculadora_assinante_ai_runs`.
 * Nunca dispara rodada nova no meio da conversa. Mesmo princípio de `gestorTiagoChatTools.ts`
 * (hub), reaproveitando `resumirResultado`/`criarOrcamentoResultadoChat` (lógica de corte de
 * tamanho é pura, não depende de seller x assinante) — só a busca de dado e a lista de
 * gestores mudam. Sem Diogo: avulso não tem esse gestor (depende de estoque interno que só o
 * hub tem).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resumirResultado, criarOrcamentoResultadoChat, type OrcamentoResultadoChat } from "./gestorTiagoChatTools";

export { criarOrcamentoResultadoChat, type OrcamentoResultadoChat };

type GestorIdAvulso = "anuncios_seo" | "reputacao_atendimento" | "ads";

const GESTORES_CONSULTAVEIS_AVULSO: { id: GestorIdAvulso; nome: string; funcao: string }[] = [
  { id: "anuncios_seo", nome: "Andrey", funcao: "Anúncios & SEO" },
  { id: "reputacao_atendimento", nome: "Amanda", funcao: "Reputação & Atendimento" },
  { id: "ads", nome: "Ulisses", funcao: "Ads & Preço" },
];

export function nomeGestorConsultavelAvulso(gestorId: string): string | null {
  return GESTORES_CONSULTAVEIS_AVULSO.find((g) => g.id === gestorId)?.nome ?? null;
}

export const TIAGO_CHAT_TOOLS_AVULSO: Anthropic.Messages.Tool[] = [
  {
    name: "consultar_gestor",
    description:
      "Consulta o resultado mais recente já calculado por um dos gestores da equipe (Andrey, Amanda ou Ulisses) pra esse assinante. NUNCA dispara uma rodada nova — só lê o que já foi gravado. Se o gestor ainda não rodou, avisa e sugere o assinante clicar em 'Rodar de novo agora' na tela dele.",
    input_schema: {
      type: "object",
      properties: {
        gestor: {
          type: "string",
          enum: GESTORES_CONSULTAVEIS_AVULSO.map((g) => g.id),
          description: "anuncios_seo=Andrey, reputacao_atendimento=Amanda, ads=Ulisses",
        },
      },
      required: ["gestor"],
    },
  },
];

const MAX_RESULTADO_CHARS = 2500;
const MIN_RESULTADO_CHARS = 350;

export async function executarToolTiagoAvulso(
  nomeTool: string,
  input: Record<string, unknown>,
  assinanteId: string,
  orcamento?: OrcamentoResultadoChat
): Promise<string> {
  if (nomeTool !== "consultar_gestor") {
    return JSON.stringify({ erro: "Ferramenta desconhecida." });
  }

  const gestorId = String(input.gestor ?? "") as GestorIdAvulso;
  const perfil = GESTORES_CONSULTAVEIS_AVULSO.find((g) => g.id === gestorId);
  if (!perfil) {
    return JSON.stringify({ erro: "Gestor inválido." });
  }

  const { data: run } = await supabaseAdmin
    .from("calculadora_assinante_ai_runs")
    .select("status, resultado, erro, criado_em")
    .eq("assinante_id", assinanteId)
    .eq("gestor", gestorId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return JSON.stringify({
      gestor: perfil.nome,
      status: "sem_rodada",
      mensagem: `${perfil.nome} (${perfil.funcao}) ainda não rodou pra esse assinante.`,
    });
  }

  if (run.status !== "ok" || !run.resultado) {
    return JSON.stringify({
      gestor: perfil.nome,
      status: "erro",
      mensagem: run.erro ?? "Última rodada terminou com erro, sem resultado.",
      executado_em: run.criado_em,
    });
  }

  const limite = orcamento
    ? Math.max(MIN_RESULTADO_CHARS, Math.min(MAX_RESULTADO_CHARS, orcamento.restante))
    : MAX_RESULTADO_CHARS;
  const resultadoResumido = resumirResultado(run.resultado, limite);
  if (orcamento) {
    orcamento.restante = Math.max(0, orcamento.restante - JSON.stringify(resultadoResumido).length);
  }

  return JSON.stringify({
    gestor: perfil.nome,
    funcao: perfil.funcao,
    status: "ok",
    executado_em: run.criado_em,
    resultado: resultadoResumido,
  });
}
