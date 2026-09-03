/**
 * Motor de cálculo de preço/margem — extraído de `web/app/seller/calculadora/page.tsx`
 * (`computeLinha`) pra ficar compartilhado entre a calculadora e os gestores de IA
 * (Andrey sugerindo preço-âncora, Ulisses calculando margem real/promoção). Mesma
 * fórmula, sem mudar comportamento: etiqueta (P) é o preço de vitrine; com cupom o
 * comprador paga R = P×(1−cupom%); margem/imposto/ads/afiliado/perda/extras/comissão
 * incidem sobre R, não sobre P.
 */

export type EfeitoCupomMargem = {
  cupomPct: number;
  descontoPct: number;
  /** Etiqueta (vitrine) quando há cupom; igual à receita efetiva se cupom 0. */
  precoSemCupom: number;
  /** Etiqueta − receita com cupom (valor do desconto na simulação). */
  reducaoPreco: number;
};

export type MargemCalculoInput = {
  custo: number;
  embalagem?: number;
  frete: number;
  margemPct: number;
  comissaoPct: number;
  impostoPct?: number;
  adsPct?: number;
  afiliadoPct?: number;
  /** % sobre a receita (ex.: avaria/devolução estimada em %). */
  perdaPct?: number;
  /** Valor fixo em R$ (alternativa a `perdaPct`; some junto se os dois vierem preenchidos). */
  perdaBrl?: number;
  extraPct?: number;
  extraBrl?: number;
  cupomPct?: number;
};

export type MargemCalculoResultado = {
  /** Receita efetiva (com cupom já aplicado na compra) — é o que efetivamente muda de mãos. */
  precoVenda: number;
  /** Preço de tabela/etiqueta antes do cupom (igual a `precoVenda` se cupom = 0). */
  precoLista: number;
  valorLucro: number;
  custosFixos: number;
  valorComissao: number;
  valorImposto: number;
  valorAds: number;
  valorAfiliado: number;
  valorPerda: number;
  valorExtrasPct: number;
  percTotal: number;
  efeitoCupom: EfeitoCupomMargem;
};

/** Retorna `null` quando a soma de percentuais estoura 100% (preço indefinido). */
export function calcularMargem(input: MargemCalculoInput): MargemCalculoResultado | null {
  const {
    custo,
    embalagem = 0,
    frete,
    margemPct,
    comissaoPct,
    impostoPct = 0,
    adsPct = 0,
    afiliadoPct = 0,
    perdaPct = 0,
    perdaBrl = 0,
    extraPct = 0,
    extraBrl = 0,
    cupomPct = 0,
  } = input;

  const affPctEfetivo = Math.max(0, afiliadoPct);
  const brutoPct = margemPct + impostoPct + adsPct + affPctEfetivo + perdaPct + extraPct;
  const percTotal = brutoPct + comissaoPct;
  if (percTotal >= 100) return null;

  const custosFixos = custo + embalagem + frete + extraBrl + perdaBrl;
  /** Recebimento bruto quando o cliente paga já com cupom aplicado sobre a etiqueta (base dos % na simulação). */
  const receitaCupom = custosFixos / (1 - percTotal / 100);
  const cupomFrac = Math.max(0, Math.min(cupomPct, 99.99));
  const precoLista = cupomFrac > 0.000001 ? receitaCupom / (1 - cupomFrac / 100) : receitaCupom;
  const precoVenda = receitaCupom;

  const valorLucro = receitaCupom * (margemPct / 100);
  const valorComissao = receitaCupom * (comissaoPct / 100);
  const valorImposto = receitaCupom * (impostoPct / 100);
  const valorAds = receitaCupom * (adsPct / 100);
  const valorAfiliado = receitaCupom * (affPctEfetivo / 100);
  const valorPerda = receitaCupom * (perdaPct / 100) + perdaBrl;
  const valorExtrasPct = receitaCupom * (extraPct / 100);
  const reducaoPreco = cupomFrac > 0.000001 ? Math.max(0, precoLista - receitaCupom) : 0;

  return {
    precoVenda,
    precoLista,
    valorLucro,
    custosFixos,
    valorComissao,
    valorImposto,
    valorAds,
    valorAfiliado,
    valorPerda,
    valorExtrasPct,
    percTotal,
    efeitoCupom: {
      cupomPct,
      descontoPct: cupomFrac,
      precoSemCupom: cupomFrac > 0.000001 ? precoLista : receitaCupom,
      reducaoPreco,
    },
  };
}

/** Preço-âncora simples pra anúncio novo: custo × (1 + margemBufferPct/100). Default 200% (3x o custo) — ver decisão do projeto (Andrey sugere, seller pode mudar antes de publicar). */
export function calcularPrecoAncora(custo: number, margemBufferPct = 200): number {
  return custo * (1 + margemBufferPct / 100);
}

export type MargemRealizadaInput = {
  /** Preço já publicado/realizado (o que o anúncio cobra hoje, sem cupom). */
  precoVenda: number;
  custo: number;
  embalagem?: number;
  frete: number;
  comissaoPct: number;
  impostoPct?: number;
  adsPct?: number;
  afiliadoPct?: number;
  perdaPct?: number;
  perdaBrl?: number;
  extraPct?: number;
  extraBrl?: number;
};

/**
 * Inverso de `calcularMargem`: aqui o preço já é conhecido (anúncio real no ar) e o que
 * falta descobrir é a margem que ele realmente entrega, dados os custos/percentuais.
 * Usado pelo Ulisses pra avaliar anúncio existente, e pelo Andrey pra decidir se um SKU
 * sem anúncio no ML precisa de preço-âncora (nesse caso não há `precoVenda` real ainda,
 * então esse SKU não passa por aqui — ver `calcularPrecoAncora`).
 */
export function calcularMargemRealizada(input: MargemRealizadaInput): number {
  const {
    precoVenda,
    custo,
    embalagem = 0,
    frete,
    comissaoPct,
    impostoPct = 0,
    adsPct = 0,
    afiliadoPct = 0,
    perdaPct = 0,
    perdaBrl = 0,
    extraPct = 0,
    extraBrl = 0,
  } = input;
  if (precoVenda <= 0) return 0;
  const custosFixos = custo + embalagem + frete + extraBrl + perdaBrl;
  const totalPct = 100 * (1 - custosFixos / precoVenda);
  return totalPct - impostoPct - comissaoPct - adsPct - afiliadoPct - perdaPct - extraPct;
}
