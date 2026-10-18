/**
 * Tools do Tiago Silva (Gestor Mestre) — só LEITURA de `seller_ai_runs`. Nunca dispara uma
 * rodada nova de gestor no meio da conversa (custo/latência imprevisível) — se o seller
 * quiser dado mais fresco, usa o botão "Rodar de novo agora" na tela do gestor, fora do chat.
 * Quem pode acessar o chat já tem o add-on ativo (gate em gestorLiberadoPorPlano), então os 4
 * gestores abaixo já estão liberados pra esse seller — não precisa checar de novo aqui.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GestorId } from "./gestorPrompts";

const GESTORES_CONSULTAVEIS: { id: GestorId; nome: string; funcao: string }[] = [
  { id: "estoque_fulfillment", nome: "Estoque", funcao: "Risco de Ruptura & Fulfillment" },
  { id: "anuncios_seo", nome: "Anúncio", funcao: "Anúncios & SEO" },
  { id: "reputacao", nome: "SAC", funcao: "Reputação & Atendimento" },
  { id: "ads", nome: "ADS", funcao: "Ads, Preço & Promoção" },
];

/** Nome amigável do gestor por `gestorId` — usado pro status transitório durante o
 * streaming do chat ("Consultando o Anúncio…", ver chat/route.ts). */
export function nomeGestorConsultavel(gestorId: string): string | null {
  return GESTORES_CONSULTAVEIS.find((g) => g.id === gestorId)?.nome ?? null;
}

export const TIAGO_CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "consultar_gestor",
    description:
      "Consulta o resultado mais recente já calculado por um dos gestores da equipe (Estoque, Anúncio, SAC ou ADS) pra esse seller. NUNCA dispara uma rodada nova — só lê o que já foi gravado. Se o gestor ainda não rodou, avisa e sugere o seller clicar em 'Rodar de novo agora' na tela dele.",
    input_schema: {
      type: "object",
      properties: {
        gestor: {
          type: "string",
          enum: GESTORES_CONSULTAVEIS.map((g) => g.id),
          description: "estoque_fulfillment=Estoque, anuncios_seo=Anúncio, reputacao=SAC, ads=ADS",
        },
      },
      required: ["gestor"],
    },
  },
  {
    name: "consultar_engajamento",
    description:
      "Devolve quantas sugestões o seller aplicou de verdade (clique real em 'aplicar'/'confirmar', não estimativa) por gestor, nos últimos 30 dias. Use quando o seller perguntar se está aproveitando os gestores, ou qual gestor ele mais/menos usa. Nunca transforme isso em 'taxa de acerto' ou percentual — é contagem real, não um score.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

/** Teto de tamanho do resultado injetado no chat — o `resultado` bruto de um gestor (ex:
 * Ulisses com catálogo grande) pode passar de 200KB/60 mil tokens se despejado inteiro,
 * o que custa reais por turno em vez de centavos. Corta arrays grandes, priorizando os
 * itens mais críticos (pior margem primeiro quando o campo existe), e some o resto num
 * contador — o seller vê a lista completa na tela do próprio gestor se precisar. */
const MAX_RESULTADO_CHARS = 2500;
const MIN_RESULTADO_CHARS = 350;
const MAX_CHARS_POR_STRING = 100;

/** Orçamento COMPARTILHADO entre todos os gestores consultados numa mesma pergunta — se o
 * Tiago chamar os 4 juntos (ex: "resumo geral"), cada resposta de tool não paga o teto
 * cheio de novo, e sim o que sobrou do total da pergunta. Sem isso, "resumo geral" custaria
 * até 4x o preço de uma pergunta de 1 gestor só. */
export type OrcamentoResultadoChat = { restante: number };

export function criarOrcamentoResultadoChat(totalChars = 3500): OrcamentoResultadoChat {
  return { restante: totalChars };
}
const CAMPOS_PIOR_MENOR_PRIMEIRO = ["margem_atual_pct", "margem_maxima_pct", "dias_ate_ruptura"];
const CAMPOS_PIOR_MAIOR_PRIMEIRO = ["urgencia", "prioridade", "dias_pendente", "queda_pct"];

/** Remove campo null/undefined (não carrega informação, só ocupa espaço) e encurta texto
 * longo (observação/diagnóstico/permalink) — genérico, não depende do schema de cada
 * gestor. Saída ainda é suficiente pro Tiago apontar o problema, só não cita o parágrafo
 * inteiro que o gestor escreveu pra tela dele. */
function enxugarValor(valor: unknown): unknown {
  if (typeof valor === "string") {
    return valor.length > MAX_CHARS_POR_STRING ? `${valor.slice(0, MAX_CHARS_POR_STRING)}…` : valor;
  }
  if (Array.isArray(valor)) {
    return valor.map(enxugarValor);
  }
  if (valor !== null && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      saida[chave] = enxugarValor(v);
    }
    return saida;
  }
  return valor;
}

function ordenarPiorPrimeiro(itens: unknown[]): unknown[] {
  if (!itens.every((item) => item !== null && typeof item === "object")) return itens;
  const primeiro = itens[0] as Record<string, unknown>;
  const campoMenor = CAMPOS_PIOR_MENOR_PRIMEIRO.find((c) => typeof primeiro[c] === "number");
  const campoMaior = !campoMenor && CAMPOS_PIOR_MAIOR_PRIMEIRO.find((c) => typeof primeiro[c] === "number");
  if (!campoMenor && !campoMaior) return itens;
  const campo = campoMenor ?? (campoMaior as string);
  const sinal = campoMenor ? 1 : -1;
  return [...itens].sort(
    (a, b) => sinal * ((a as Record<string, number>)[campo] - (b as Record<string, number>)[campo])
  );
}

function truncarArrays(resultado: Record<string, unknown>, maxItens: number): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(resultado)) {
    if (Array.isArray(valor) && valor.length > maxItens) {
      saida[chave] = ordenarPiorPrimeiro(valor).slice(0, maxItens);
      saida[`${chave}_total_real`] = valor.length;
      saida[`${chave}_omitidos_por_tamanho`] = valor.length - maxItens;
    } else {
      saida[chave] = valor;
    }
  }
  return saida;
}

export function resumirResultado(resultado: unknown, maxChars: number): unknown {
  if (resultado === null || typeof resultado !== "object" || Array.isArray(resultado)) return resultado;
  const enxuto = enxugarValor(resultado) as Record<string, unknown>;
  let maxItens = 15;
  let saida = truncarArrays(enxuto, maxItens);
  while (JSON.stringify(saida).length > maxChars && maxItens > 2) {
    maxItens = Math.floor(maxItens / 2);
    saida = truncarArrays(enxuto, maxItens);
  }
  return saida;
}

export async function executarToolTiago(
  nomeTool: string,
  input: Record<string, unknown>,
  sellerId: string,
  orcamento?: OrcamentoResultadoChat
): Promise<string> {
  if (nomeTool === "consultar_engajamento") {
    const { data, error } = await supabaseAdmin.rpc("fn_seller_ai_acoes_resumo", {
      p_seller_id: sellerId,
      p_dias: 30,
    });
    if (error) {
      console.error("[gestorTiagoChatTools] consultar_engajamento falhou", error);
      return JSON.stringify({ erro: "Não foi possível consultar o engajamento agora." });
    }
    const qtdPorGestor = new Map(
      ((data ?? []) as { gestor: GestorId; qtd_acoes: number }[]).map((r) => [r.gestor, r.qtd_acoes])
    );
    const engajamento = GESTORES_CONSULTAVEIS.map((g) => ({
      gestor: g.nome,
      qtd_acoes_30d: qtdPorGestor.get(g.id) ?? 0,
    }));
    return JSON.stringify({ engajamento });
  }

  if (nomeTool !== "consultar_gestor") {
    return JSON.stringify({ erro: "Ferramenta desconhecida." });
  }

  const gestorId = String(input.gestor ?? "") as GestorId;
  const perfil = GESTORES_CONSULTAVEIS.find((g) => g.id === gestorId);
  if (!perfil) {
    return JSON.stringify({ erro: "Gestor inválido." });
  }

  const { data: run } = await supabaseAdmin
    .from("seller_ai_runs")
    .select("status, resultado, erro_mensagem, executado_em")
    .eq("seller_id", sellerId)
    .eq("gestor", gestorId)
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return JSON.stringify({
      gestor: perfil.nome,
      status: "sem_rodada",
      mensagem: `${perfil.nome} (${perfil.funcao}) ainda não rodou pra esse seller.`,
    });
  }

  if (run.status !== "ok" || !run.resultado) {
    return JSON.stringify({
      gestor: perfil.nome,
      status: "erro",
      mensagem: run.erro_mensagem ?? "Última rodada terminou com erro, sem resultado.",
      executado_em: run.executado_em,
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
    executado_em: run.executado_em,
    resultado: resultadoResumido,
  });
}
