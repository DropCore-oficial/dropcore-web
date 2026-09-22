/**
 * Candidatos de Oferta Relâmpago (Lightning) com margem calculada — o Mercado Livre escolhe
 * os itens e propõe um preço inicial, mas a tela "Revise e confirme as propostas" do próprio
 * ML deixa o valor/% editável antes de confirmar (corrigido 2026-09-20 — antes achávamos que
 * era fixo). Aqui cruzamos com o custo real (mesma fonte do resto do Ulisses) e, quando o ML
 * reporta uma faixa [min, max] pro item, calculamos o preço mais raso (menor desconto) dentro
 * dela que ainda protege a margem mínima configurada — em vez de só aceitar/recusar o valor
 * cru que o ML propôs.
 */
import { calcularMargemRealizada } from "@/lib/margemCalculo";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarCandidatosLightning,
  mlBuscarItensDetalhe,
  mlBuscarFreteReal,
  mlBuscarLimitesLightning,
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
  /** Valor cru que o próprio ML propôs no candidato — só referência, não é mais o que
   * mandamos pra aceitar (ver precoRecomendado). */
  precoSugeridoMl: number;
  /** Faixa [min, max] que o ML reporta pro item (`null` quando o item não tem faixa
   * reportada) — ver ressalva de confiabilidade em `mlBuscarLimitesLightning`. */
  faixaMl: { min: number; max: number } | null;
  /** Preço que o Ulisses recomenda mandar de verdade: o mais raso (menor desconto) dentro da
   * faixa do ML que ainda cobre a margem mínima — cai pro `precoSugeridoMl` quando o ML não
   * reporta faixa pro item. */
  precoRecomendado: number;
  editavel: boolean;
  estoqueMax: number;
  margemResultantePct: number;
  margemMinimaPct: number;
  recomendacao: "aceitar" | "recusar";
  permalink: string | null;
  /** Parâmetros usados no cálculo de margem, guardados pra recalcular com um preço diferente
   * (ver `calcularMargemLightningEm`) sem precisar buscar tudo de novo na API do ML. */
  comissaoPct: number;
  impostoPct: number;
  perdaPct: number;
};

type LightningMargemParams = Pick<LightningCandidatoResultado, "custo" | "freteReal" | "comissaoPct" | "impostoPct" | "perdaPct">;

/** Recalcula a margem de um candidato pra um preço qualquer — usado pra validar no servidor
 * um `preco_escolhido` que o seller/Ulisses tenha ajustado dentro da faixa do ML, sem
 * precisar confiar na margem já calculada pro `precoRecomendado`. */
export function calcularMargemLightningEm(candidato: LightningMargemParams, preco: number): number {
  return calcularMargemRealizada({
    precoVenda: preco,
    custo: candidato.custo,
    frete: candidato.freteReal ?? 0,
    comissaoPct: candidato.comissaoPct,
    impostoPct: candidato.impostoPct,
    perdaPct: candidato.perdaPct,
  });
}

/** Limita um preço escolhido à faixa que o ML reporta pro item (quando existe) e ao teto do
 * preço original — usado pra validar no servidor um valor que o seller tenha editado na
 * tela. `precoConhecidoValido` (o `candidato.price` original) entra como teto alternativo:
 * achado ao vivo 2026-09-20 que o `max_discounted_price` reportado às vezes vem MAIS BAIXO
 * que o preço que o próprio ML já tinha como padrão pro candidato — sem isso, editar o
 * campo de volta pro valor original do ML seria clampado pra baixo por engano. */
export function limitarPrecoLightning(
  precoDesejado: number,
  faixaMl: { min: number; max: number } | null,
  precoOriginal: number,
  precoConhecidoValido: number = precoOriginal
): number {
  const teto = Math.min(Math.max(faixaMl?.max ?? precoOriginal, precoConhecidoValido), precoOriginal);
  const piso = faixaMl ? faixaMl.min : 0;
  return Math.min(Math.max(precoDesejado, piso), teto);
}

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

  // Um candidato por vez em sequência levava 20-30s+ pra lista inteira (cada um faz 2
  // chamadas próprias à API do ML) — sem indicador de carregamento na tela, parecia que a
  // seção tinha sumido (achado testando ao vivo 2026-09-21). Paraleliza com Promise.all,
  // mesmo padrão já usado em gestorAnunciosSeoDados.ts pra buscar dado por item do grupo.
  const linhas = await Promise.all(
    comVinculo.map(async (candidato): Promise<LightningCandidatoResultado | null> => {
      const info = infoPorItemId.get(candidato.id);
      const item = detalhePorId.get(candidato.id);
      if (!info || !item) return null;

      const { comissaoPct } = mlComissaoPorListingType(item.listing_type_id);
      const [freteReal, limites] = await Promise.all([
        mlBuscarFreteReal(candidato.id, ctx, CEP_REFERENCIA_FRETE),
        mlBuscarLimitesLightning(candidato.id, ctx),
      ]);
      const faixaMl = limites ? { min: limites.min, max: limites.max } : null;
      const margemParams: LightningMargemParams = {
        custo: info.custo,
        freteReal,
        comissaoPct,
        impostoPct: prefs.impostoPct,
        perdaPct: prefs.perdaPct,
      };

      // Preço mais raso (menor desconto) dentre os valores que já sabemos que o ML aceita: o
      // valor cru do candidato (`candidato.price`, aceite confirmado ao vivo 2026-09-16) e o
      // teto da faixa reportada (`max_discounted_price`, aceite confirmado ao vivo 2026-09-20).
      // Achado real testando: os dois podem divergir e o `max` reportado às vezes é MAIS FUNDO
      // que o preço que o próprio ML já tinha como padrão — por isso NÃO passa por
      // `limitarPrecoLightning` aqui (isso clamparia candidato.price pra baixo do necessário
      // quando ele já é maior que o `max` reportado). Pega sempre o maior dos dois valores
      // conhecidos-bons (o mais raso), nunca mais agressivo que o que já era garantido. Se nem
      // esse cobrir a margem mínima, nenhum preço menor vai cobrir — vira recusar.
      const precoRecomendado = Math.min(Math.max(candidato.price, faixaMl?.max ?? candidato.price), candidato.originalPrice);
      const margemResultantePct = calcularMargemLightningEm(margemParams, precoRecomendado);

      return {
        ...margemParams,
        itemId: candidato.id,
        dealId: candidato.dealId,
        sku: info.sku,
        nomeProduto: info.nomeProduto,
        precoOriginal: candidato.originalPrice,
        precoSugeridoMl: candidato.price,
        faixaMl,
        precoRecomendado,
        editavel: limites != null,
        estoqueMax: candidato.stockMax,
        margemResultantePct,
        margemMinimaPct: prefs.margemMinimaPct,
        recomendacao: margemResultantePct >= prefs.margemMinimaPct ? "aceitar" : "recusar",
        permalink: item.permalink ?? null,
      };
    })
  );

  // Pior margem primeiro — mesmo princípio já usado no resto do Ulisses (não amostra
  // aleatória, prioriza o que precisa de mais atenção).
  return linhas
    .filter((l): l is LightningCandidatoResultado => l != null)
    .sort((a, b) => a.margemResultantePct - b.margemResultantePct);
}
