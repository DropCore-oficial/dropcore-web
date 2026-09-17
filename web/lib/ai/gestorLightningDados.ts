/**
 * Candidatos de Oferta Relâmpago (Lightning) com margem calculada — o Mercado Livre escolhe
 * os itens e o preço sozinho, sem olhar custo/margem do seller; aqui só cruzamos com o custo
 * real (mesma fonte do resto do Ulisses) pra decidir se aceitar aquele preço específico ainda
 * deixa a margem mínima configurada. Preço não é negociável (ver mercadoLivreApiClient.ts) —
 * a única decisão de negócio é binária: aceitar ou não aceitar o que o ML já sugeriu.
 */
import { calcularMargemRealizada } from "@/lib/margemCalculo";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarCandidatosLightning,
  mlBuscarItensDetalhe,
  mlBuscarFreteReal,
  mlComissaoPorListingType,
} from "@/lib/mercadoLivreApiClient";
import { buscarPreferenciasUlisses, buscarVinculosComCusto } from "@/lib/ai/gestorAdsDados";

/** Mesma referência de CEP já usada no resto do Ulisses (frete real varia por região, mas
 * precisa de um ponto fixo de comparação — ver gestorAdsDados.ts). */
const CEP_REFERENCIA_FRETE = "01310100";

export type LightningCandidatoResultado = {
  itemId: string;
  dealId: string;
  sku: string;
  nomeProduto: string;
  custo: number;
  freteReal: number | null;
  precoOriginal: number;
  precoSugerido: number;
  estoqueMax: number;
  margemResultantePct: number;
  margemMinimaPct: number;
  recomendacao: "aceitar" | "recusar";
  permalink: string | null;
};

export async function buscarCandidatosLightningComMargem(sellerId: string): Promise<LightningCandidatoResultado[]> {
  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) return [];

  const prefs = await buscarPreferenciasUlisses(sellerId);
  if (!prefs) return [];

  const candidatosBrutos = await mlBuscarCandidatosLightning(ctx);
  if (candidatosBrutos.length === 0) return [];

  const infoPorItemId = await buscarVinculosComCusto(sellerId);
  const comVinculo = candidatosBrutos.filter((c) => infoPorItemId.has(c.id));
  if (comVinculo.length === 0) return [];

  const detalhes = await mlBuscarItensDetalhe(comVinculo.map((c) => c.id), ctx);
  const detalhePorId = new Map(detalhes.map((d) => [d.id, d]));

  const resultado: LightningCandidatoResultado[] = [];
  for (const candidato of comVinculo) {
    const info = infoPorItemId.get(candidato.id);
    const item = detalhePorId.get(candidato.id);
    if (!info || !item) continue;

    const { comissaoPct } = mlComissaoPorListingType(item.listing_type_id);
    const freteReal = await mlBuscarFreteReal(candidato.id, ctx, CEP_REFERENCIA_FRETE);

    // Sem Ads/afiliado de propósito — mesma filosofia do "preço mínimo seguro" já usado no
    // resto do Ulisses: pergunta é "esse preço específico se sustenta sozinho", não "qual a
    // margem realizada com o gasto de Ads em andamento" (Ads é alavanca separada).
    const margemResultantePct = calcularMargemRealizada({
      precoVenda: candidato.price,
      custo: info.custo,
      frete: freteReal ?? 0,
      comissaoPct,
      impostoPct: prefs.impostoPct,
      perdaPct: prefs.perdaPct,
    });

    resultado.push({
      itemId: candidato.id,
      dealId: candidato.dealId,
      sku: info.sku,
      nomeProduto: info.nomeProduto,
      custo: info.custo,
      freteReal,
      precoOriginal: candidato.originalPrice,
      precoSugerido: candidato.price,
      estoqueMax: candidato.stockMax,
      margemResultantePct,
      margemMinimaPct: prefs.margemMinimaPct,
      recomendacao: margemResultantePct >= prefs.margemMinimaPct ? "aceitar" : "recusar",
      permalink: item.permalink ?? null,
    });
  }

  // Pior margem primeiro — mesmo princípio já usado no resto do Ulisses (não amostra
  // aleatória, prioriza o que precisa de mais atenção).
  return resultado.sort((a, b) => a.margemResultantePct - b.margemResultantePct);
}
