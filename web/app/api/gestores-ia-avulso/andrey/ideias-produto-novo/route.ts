/**
 * POST /api/gestores-ia-avulso/andrey/ideias-produto-novo — Andrey sugere título, modelo,
 * ocasiões e estilos pra até 3 anúncios do mesmo produto (ainda não publicado), mais uma
 * descrição única reaproveitada nos 3. Síncrono (sem Batch), mesmo padrão do diagnóstico
 * principal. Nunca escreve nada no Mercado Livre — só sugestão pro assinante usar ao
 * publicar pelo app oficial. Escopo fechado em 2026-10-07 (Sr Stark): só esses 5 campos —
 * nunca Marca/Cor/Tamanho/Material/Condição/embalagem/variação/foto/vídeo.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { getValidMercadoLivreAvulsoAccessToken } from "@/lib/mercadoLivreAvulsoToken";
import { mlBuscarAtributosCategoria, type MercadoLivreAtributoCategoria } from "@/lib/mercadoLivreApiClient";
import { montarPrompt } from "@/lib/ai/gestorPrompts";
import { MODELO_GESTORES_IA } from "@/lib/ai/gestorRequestBuilders";
import { parseGestorResposta } from "@/lib/ai/gestorParseResposta";
import {
  PROMPT_IDEIAS_PRODUTO_NOVO,
  buildSchemaIdeiasProdutoNovo,
  type AtributoSeoContexto,
} from "@/lib/ai/gestorAnuncioNovoIdeiasAvulso";
import { temOrcamentoDisponivelHoje, chaveByokDoAssinante, type AssinanteByok } from "@/lib/ai/gestorAvulsoOrcamento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function paraAtributoContexto(a: MercadoLivreAtributoCategoria | undefined): AtributoSeoContexto | null {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    valueType: a.valueType,
    valoresPermitidos: a.valoresPermitidos,
    valorMaxLength: a.valorMaxLength,
  };
}

/** Limite real do título no Mercado Livre é 60 caracteres — `maxLength` no schema da IA é só
 * uma dica pro modelo, NÃO é uma trava garantida (testado ao vivo 2026-10-07: a IA entregou
 * 63/64/67 caracteres nos 3 títulos de uma mesma rodada, mesmo com o schema marcando 60).
 * Corta na última palavra inteira que couber, nunca no meio de uma palavra. */
function truncarTitulo(titulo: string, limite = 60): string {
  const t = titulo.trim();
  if (t.length <= limite) return t;
  const cortado = t.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > 0 ? cortado.slice(0, ultimoEspaco) : cortado).trim();
}

/** Valida um valor sugerido contra o schema real do atributo (mesma defesa em profundidade
 * do diagnóstico principal). Quando o atributo não existe na categoria, força vazio — nunca
 * confia em texto que a IA tenha gerado pra um campo inexistente. */
function validarValorAtributo(atributo: MercadoLivreAtributoCategoria | undefined, valorSugerido: string): string {
  if (!atributo) return "";
  if (atributo.valueType !== "list" || atributo.valoresPermitidos.length === 0) {
    return valorSugerido.trim();
  }
  const valoresValidos = valorSugerido
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v && atributo.valoresPermitidos.includes(v));
  return valoresValidos.join(", ");
}

export async function POST(req: Request) {
  const assinante = await getAssinanteFromToken(req);
  if (!assinante) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (assinante.inclui_gestores_ia !== true) {
    return NextResponse.json({ error: "Recurso não disponível." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { category_id?: string; descricao?: string };
  const categoryId = body.category_id?.trim();
  const descricaoLivre = body.descricao?.trim();
  if (!categoryId || !descricaoLivre) {
    return NextResponse.json({ error: "category_id e descricao são obrigatórios." }, { status: 400 });
  }

  const { data: assinanteByok } = await supabaseAdmin
    .from("calculadora_assinantes")
    .select("anthropic_api_key_encriptada")
    .eq("id", assinante.id)
    .maybeSingle<AssinanteByok>();
  if (!assinanteByok) {
    return NextResponse.json({ error: "Erro ao carregar orçamento." }, { status: 500 });
  }
  if (!(await temOrcamentoDisponivelHoje(assinanteByok, assinante.id))) {
    return NextResponse.json(
      { error: "Limite diário de IA incluso no plano foi atingido. Ele renova à meia-noite." },
      { status: 402 }
    );
  }
  const chaveByok = chaveByokDoAssinante(assinanteByok);
  const apiKey = chaveByok ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada." }, { status: 500 });
  }

  const ctx = await getValidMercadoLivreAvulsoAccessToken(assinante.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte o Mercado Livre primeiro." }, { status: 422 });
  }

  const schema = await mlBuscarAtributosCategoria(categoryId, ctx);
  const categoriaInfo = await (async () => {
    const res = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
    const json = (await res.json().catch(() => ({}))) as { name?: string };
    return json.name ?? categoryId;
  })();

  const modeloAttr = schema.find((a) => a.id === "MODEL");
  const ocasioesAttr = schema.find((a) => a.id === "OCCASIONS");
  const estilosAttr = schema.find((a) => a.id === "STYLES");

  const client = new Anthropic({ apiKey });
  let resultado: unknown;
  let erroMensagem: string | null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let webSearchRequests = 0;
  try {
    const message = await client.messages.create({
      model: MODELO_GESTORES_IA,
      max_tokens: 8192,
      thinking: { type: "disabled" },
      // Ferramenta de busca real da Anthropic — pedido explícito do Sr Stark 2026-10-07
      // pra não ficar só no vocabulário técnico do Mercado Livre/conhecimento de treino,
      // pesquisar termo/tendência real antes de sugerir. Custo de busca é cobrado separado
      // dos tokens pela Anthropic — não entra na conta de tokens_input/tokens_output abaixo.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      output_config: {
        format: {
          type: "json_schema",
          schema: buildSchemaIdeiasProdutoNovo({
            modelo: modeloAttr?.valorMaxLength ?? null,
            ocasioes: ocasioesAttr?.valorMaxLength ?? null,
            estilos: estilosAttr?.valorMaxLength ?? null,
          }),
        },
      },
      messages: [
        {
          role: "user",
          content: montarPrompt(PROMPT_IDEIAS_PRODUTO_NOVO, {
            categoriaNome: categoriaInfo,
            descricaoLivre,
            modeloAtributo: paraAtributoContexto(modeloAttr),
            ocasioesAtributo: paraAtributoContexto(ocasioesAttr),
            estilosAtributo: paraAtributoContexto(estilosAttr),
          }),
        },
      ],
    });
    tokensInput = message.usage?.input_tokens ?? 0;
    tokensOutput = message.usage?.output_tokens ?? 0;
    webSearchRequests = message.usage?.server_tool_use?.web_search_requests ?? 0;
    ({ resultado, erroMensagem } = parseGestorResposta(message));
  } catch (e: unknown) {
    erroMensagem = e instanceof Error ? e.message : "Erro ao chamar a Anthropic.";
    resultado = null;
  }

  if (erroMensagem || !resultado) {
    return NextResponse.json({ error: erroMensagem ?? "Erro ao gerar ideias." }, { status: 502 });
  }

  const parsed = resultado as {
    anuncios_sugeridos: {
      titulo_sugerido: string;
      modelo_sugerido: string;
      ocasioes_sugeridas: string;
      estilos_sugeridos: string;
    }[];
    descricao_corpo: string;
    faq: { pergunta: string; resposta: string }[];
    observacao: string;
  };

  // Schema da Anthropic não aceita minItems/maxItems != 0/1 pra array — garantir "exatamente
  // 3" fica 100% a cargo do prompt + desse corte defensivo (a IA já foi instruída a sempre
  // devolver 3; isso só protege contra ela errar a contagem).
  const anunciosValidados = parsed.anuncios_sugeridos.slice(0, 3).map((a) => ({
    titulo_sugerido: truncarTitulo(a.titulo_sugerido),
    modelo_sugerido: modeloAttr ? a.modelo_sugerido.trim() : "",
    ocasioes_sugeridas: validarValorAtributo(ocasioesAttr, a.ocasioes_sugeridas),
    estilos_sugeridos: validarValorAtributo(estilosAttr, a.estilos_sugeridos),
  }));

  // Registra o uso pra contar no orçamento diário (gastoAvulsoHojeReais soma tokens +
  // web_search_requests de qualquer linha do assinante). BYOK não grava custo (não é
  // custo do DropCore) — nem tokens, nem busca web.
  await supabaseAdmin.from("calculadora_assinante_ai_runs").insert({
    assinante_id: assinante.id,
    gestor: "anuncios_seo",
    status: "ok",
    resultado: { tipo: "ideias_produto_novo", categoria_id: categoryId },
    tokens_input: chaveByok ? null : tokensInput,
    tokens_output: chaveByok ? null : tokensOutput,
    web_search_requests: chaveByok ? null : webSearchRequests,
  });

  return NextResponse.json({
    anuncios_sugeridos: anunciosValidados,
    descricao_corpo: parsed.descricao_corpo.trim(),
    // Descarta item de FAQ sem pergunta ou sem resposta — já aconteceu ao vivo (2026-10-07)
    // a IA devolver uma resposta "órfã", sem a pergunta correspondente. Melhor sumir o item
    // inteiro do que mostrar resposta solta sem contexto.
    faq: parsed.faq
      .map((f) => ({ pergunta: f.pergunta.trim(), resposta: f.resposta.trim() }))
      .filter((f) => f.pergunta.length > 0 && f.resposta.length > 0),
    observacao: parsed.observacao,
    categoria_sem_atributo: {
      modelo: !modeloAttr,
      ocasioes: !ocasioesAttr,
      estilos: !estilosAttr,
    },
  });
}
