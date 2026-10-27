/**
 * Diagnóstico de foto da Laura (gestor Design) pro assinante avulso — V1 só diagnostica
 * (boa/ruim + motivo), não gera imagem nova (ver memória de projeto "Laura V1/V2", geração
 * fica pro V2). Chamada embutida dentro da própria rodada do Anúncio (`gestorAnunciosSeoDadosAvulso.ts`),
 * só quando o funil de conversão esgota todas as outras causas checáveis (reclamação,
 * reputação, promoção, preço, variação, texto) — não é um gestor com cron/rodada própria,
 * a Laura só é "chamada" por dentro do Anúncio. Dispara automática (sem o seller precisar
 * clicar em nada) — decisão 2026-10-19: diagnóstico nunca depende de clique em nenhum outro
 * gestor desse sistema, só ação (aplicar/pausar) depende.
 */
import Anthropic from "@anthropic-ai/sdk";
import { MODELO_GESTORES_IA } from "./gestorRequestBuilders";
import { parseGestorResposta } from "./gestorParseResposta";

export type VeredictoFotoAnuncio = "boa" | "ruim";

export type ResultadoAnaliseFotoAvulso = {
  veredito: VeredictoFotoAnuncio;
  motivo: string;
  tokensInput: number;
  tokensOutput: number;
};

const SCHEMA_ANALISE_FOTO = {
  type: "object",
  properties: {
    veredito: { type: "string", enum: ["boa", "ruim"] },
    motivo: { type: "string" },
  },
  required: ["veredito", "motivo"],
  additionalProperties: false,
} as const;

/** Manda o álbum quase inteiro (ML permite até ~12 fotos por anúncio) — achado real
 * 2026-10-19, analisando o anúncio campeão do Sr Stark: o que diferencia um álbum que
 * converte não é só a foto de capa estar tecnicamente boa, é a SEQUÊNCIA ter os reforços
 * certos (detalhe de tecido, detalhe de acabamento, produto em uso, benefícios, tabela de
 * medida) — analisar só 1-2 fotos nunca pegaria isso. */
const MAX_FOTOS_ANALISADAS = 10;

export type MediaTypeSuportado = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Baixa a foto e converte pra base64 — testado ao vivo 2026-10-19: passar a URL direto
 * (`source: {type: "url"}`) dá 400 "Unable to download the file" porque o CDN do Mercado
 * Livre (`mlstatic.com`) rejeita o jeito que a Anthropic tenta buscar (HEAD dá 405). Baixar
 * aqui (mesmo site, mas com `fetch` normal, que usa GET) e mandar os bytes direto resolve —
 * mesmo padrão já usado em `gestorDisputasFornecedorDados.ts` (lá os bytes vêm do Storage,
 * aqui vêm da internet, mas o formato do content block é o mesmo). Achado real 2026-10-20:
 * o ML serve bastante foto em `webp`, não só jpeg/png — mandar `media_type` errado (ex.
 * "jpeg" numa foto que é webp de verdade) dá 400 da Anthropic. Detecta pelo `content-type`
 * real da resposta, nunca assume. `null` quando o formato não é um dos suportados pela API
 * de visão (mais seguro que mandar um `media_type` forçado/errado). */
export async function baixarFotoComoBase64(url: string): Promise<{ mediaType: MediaTypeSuportado; data: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    let mediaType: MediaTypeSuportado | null = null;
    if (contentType.includes("webp")) mediaType = "image/webp";
    else if (contentType.includes("png")) mediaType = "image/png";
    else if (contentType.includes("gif")) mediaType = "image/gif";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) mediaType = "image/jpeg";
    if (!mediaType) return null;
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { mediaType, data };
  } catch {
    return null;
  }
}

/** `null` quando a chamada falha (erro de rede, resposta fora do formato) — quem chama
 * decide o que fazer (não assume "foto ruim" por falha técnica). */
export async function analisarFotoAnuncioAvulso(
  fotoUrls: string[],
  apiKey: string
): Promise<ResultadoAnaliseFotoAvulso | null> {
  const urls = fotoUrls.slice(0, MAX_FOTOS_ANALISADAS);
  if (urls.length === 0) return null;

  const fotosBaixadas = (await Promise.all(urls.map(baixarFotoComoBase64))).filter(
    (f): f is { mediaType: MediaTypeSuportado; data: string } => f !== null
  );
  if (fotosBaixadas.length === 0) return null;

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model: MODELO_GESTORES_IA,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: SCHEMA_ANALISE_FOTO } },
      messages: [
        {
          role: "user",
          content: [
            ...fotosBaixadas.map((f) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: f.mediaType, data: f.data },
            })),
            {
              type: "text" as const,
              text:
                "Você é um especialista em fotografia de produto pra e-commerce. Essas são TODAS as fotos (na " +
                "ordem do álbum) de um anúncio do Mercado Livre que tem visita real de comprador mas não está " +
                "vendendo — reclamação, reputação, promoção, preço, estoque e texto já foram descartados como " +
                "causa. Avalie em duas frentes:\n\n" +
                "1) PROBLEMA TÉCNICO na foto de capa (a primeira): está desfocada, com o produto cortado/" +
                "incompleto, ou com iluminação ruim? Sobre o FUNDO: nunca reprove por estilo (fundo de estúdio " +
                "branco e fundo de ambiente real/rua são igualmente válidos — isso é algo que cada seller testa " +
                "na própria conta, não existe estilo certo universal). Só reprove o fundo quando ele gerar " +
                "AMBIGUIDADE real sobre o que está sendo vendido — outro produto aparecendo, texto de terceiro, " +
                "ou elementos disputando atenção com o produto principal. Fundo desfocado sem nenhum outro " +
                "objeto em foco está OK, mesmo não sendo branco.\n\n" +
                "2) REFORÇOS QUE FALTAM no álbum como um todo — olhando a sequência completa, o álbum tem pelo " +
                "menos ALGUNS desses elementos (não precisa ter todos): o produto sendo USADO/VESTIDO (não só " +
                "still/pendurado), detalhe de TECIDO ou MATERIAL em close, detalhe de ACABAMENTO (costura, " +
                "fechamento, textura), texto reforçando BENEFÍCIOS/atributos do produto, e (quando fizer " +
                "sentido pro tipo de produto, ex. roupa) uma TABELA DE MEDIDAS? Um álbum só com 1-2 fotos " +
                "genéricas, sem nenhum desses reforços, é um sinal real de conversão fraca.\n\n" +
                "Classifique \"ruim\" quando achar problema técnico real na capa (frente 1) OU quando o álbum " +
                "carecer da maioria desses reforços (frente 2) — nesse caso, `motivo` deve dizer especificamente " +
                "o que falta (ex: \"não mostra o produto vestido, nem tem tabela de medidas\"), não genérico. " +
                "Classifique \"boa\" quando a capa está tecnicamente adequada E o álbum já tem reforços " +
                "relevantes — não invente defeito só pra justificar \"ruim\". `motivo` sempre curto e objetivo.",
            },
          ],
        },
      ],
    });
    const { resultado, erroMensagem } = parseGestorResposta(message);
    if (erroMensagem || !resultado) return null;
    const r = resultado as { veredito?: string; motivo?: string };
    if (r.veredito !== "boa" && r.veredito !== "ruim") return null;
    return {
      veredito: r.veredito,
      motivo: r.motivo ?? "",
      tokensInput: message.usage?.input_tokens ?? 0,
      tokensOutput: message.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    console.error("[gestorDesignFotoAvulso] análise de foto falhou", e);
    return null;
  }
}
