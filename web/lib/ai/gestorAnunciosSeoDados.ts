/**
 * Dado real pro gestor "Anúncios & SEO": busca os anúncios ativos do seller no Mercado
 * Livre, escolhe os 20 piores por venda histórica entre os que já estão no ar há 30+ dias
 * (evita julgar anúncio novo sem dado suficiente), e complementa com descrição + visitas.
 *
 * Catálogo pode ter centenas de anúncios (ex.: 563 na conta de teste) — não dá pra mandar
 * tudo pro prompt (mesmo estouro de token que já corrigimos no gestor de Ruptura). Por isso
 * primeiro passo é local: busca até 100 anúncios ativos (1 chamada), pega detalhe de todos
 * via multiget, e só faz as chamadas caras (descrição + visitas, 1 por item) nos 20
 * selecionados — não no catálogo inteiro.
 */
import type { PromptTemplate } from "./gestorPrompts";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarItensAtivos,
  mlBuscarItensDetalhe,
  mlBuscarDescricao,
  mlBuscarVisitas30d,
} from "@/lib/mercadoLivreApiClient";

export type AnuncioSeoContexto = {
  itemId: string;
  titulo: string;
  descricaoResumo: string;
  preco: number;
  quantidadeFotos: number;
  diasNoAr: number;
  vendasTotais: number;
  visitas30d: number;
};

const DIAS_MINIMOS_NO_AR = 30;
const MAX_CANDIDATOS = 20;

export async function buscarDadosAnunciosSeo(sellerId: string): Promise<AnuncioSeoContexto[]> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return [];

  const ids = await mlBuscarItensAtivos(ctx, 100);
  if (ids.length === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(ids, ctx);
  const agora = Date.now();
  const elegiveis = detalhes
    .map((d) => ({
      ...d,
      diasNoAr: Math.floor((agora - new Date(d.start_time).getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter((d) => d.diasNoAr >= DIAS_MINIMOS_NO_AR)
    .sort((a, b) => a.sold_quantity - b.sold_quantity)
    .slice(0, MAX_CANDIDATOS);

  const contexto: AnuncioSeoContexto[] = [];
  for (const item of elegiveis) {
    const [descricao, visitas30d] = await Promise.all([
      mlBuscarDescricao(item.id, ctx),
      mlBuscarVisitas30d(item.id, ctx),
    ]);
    contexto.push({
      itemId: item.id,
      titulo: item.title,
      descricaoResumo: descricao.slice(0, 400),
      preco: item.price,
      quantidadeFotos: item.pictures?.length ?? 0,
      diasNoAr: item.diasNoAr,
      vendasTotais: item.sold_quantity,
      visitas30d,
    });
  }
  return contexto;
}

function formatarAnunciosSeo(anuncios: AnuncioSeoContexto[]): string {
  return anuncios
    .map(
      (a) =>
        `- ${a.itemId}: título atual "${a.titulo}" | preço R$ ${a.preco.toFixed(2)} | ${a.quantidadeFotos} fotos | ${a.diasNoAr} dias no ar | ${a.vendasTotais} vendas no total | ${a.visitas30d} visitas nos últimos 30 dias | descrição atual (resumo): "${a.descricaoResumo || "(sem descrição)"}"`
    )
    .join("\n");
}

export const PROMPT_ANUNCIOS_SEO: PromptTemplate<AnuncioSeoContexto[]> = {
  id: "anuncios_seo_diagnostico",
  gestor: "anuncios_seo",
  titulo: "Diagnóstico de Anúncios & SEO",
  persona:
    "Você é um especialista em SEO e otimização de anúncio de marketplace, focado em título, " +
    "descrição e apresentação visual que aumentam visita e conversão orgânica.",
  tarefa: [
    "Para cada anúncio, avalie se o título, a descrição ou a quantidade de fotos parecem estar " +
      "prejudicando a performance (poucas visitas ou vendas considerando o tempo no ar).",
    "Classifique cada anúncio em: problema de título, problema de descrição, poucas fotos, sem " +
      "problema aparente.",
    "Para os anúncios com problema, sugira um título melhorado — mantendo o produto real, sem " +
      "inventar característica que não esteja na descrição atual.",
  ],
  restricoes: [
    "Nunca invente característica, material ou benefício do produto que não esteja na descrição " +
      "ou no título atual — só reorganizar/destacar o que já existe.",
    "Título sugerido tem que ser curto (até 60 caracteres) — título longo é cortado nos " +
      "resultados de busca do marketplace.",
    "Isso é sugestão pro seller revisar e decidir se aplica — nunca afirme que o anúncio já foi " +
      "alterado.",
    "titulo_sugerido e observacao têm que ser curtos e diretos — o catálogo pode ter vários " +
      "anúncios analisados de uma vez.",
  ],
  formatoSaida: [
    "Tabela: Anúncio | Diagnóstico | Título sugerido | Observação",
    "Bloco final: os anúncios que mais valem a pena revisar primeiro.",
  ].join("\n"),
  montarContexto: (anuncios) => `Meus anúncios ativos (amostra com pior venda, 30+ dias no ar):\n${formatarAnunciosSeo(anuncios)}`,
};

export const SCHEMA_ANUNCIOS_SEO = {
  type: "object",
  properties: {
    anuncios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          diagnostico: {
            type: "string",
            enum: ["problema_titulo", "problema_descricao", "poucas_fotos", "sem_problema_aparente"],
          },
          titulo_sugerido: { type: "string", maxLength: 70 },
          observacao: { type: "string", maxLength: 140 },
        },
        required: ["item_id", "diagnostico", "titulo_sugerido", "observacao"],
        additionalProperties: false,
      },
    },
    destaque_prioridade: {
      type: "array",
      items: { type: "string" },
      description: "item_ids que mais valem a pena revisar primeiro.",
    },
  },
  required: ["anuncios", "destaque_prioridade"],
  additionalProperties: false,
} as const;
