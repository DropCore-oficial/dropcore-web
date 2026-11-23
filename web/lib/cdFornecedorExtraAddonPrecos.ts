/** Taxa mensal por fornecedor adicional do CD DropCore — fixa, igual pra todo plano (ver
 * decisão 2026-11-19: simples de cobrar/entender, ajuste fino de pricing por plano só faz
 * sentido depois de ter dado real de uso). Separada da taxa de fulfillment por pedido
 * (`fornecedores.cd_fulfillment_taxa_valor`) — esta cobra do SELLER, por mês, pelo direito
 * de ter mais de 1 fornecedor; a outra cobra do FORNECEDOR, por pedido, pelo trabalho físico
 * de picking/despacho. Nunca misturar as duas. */
export const VALOR_ADDON_CD_FORNECEDOR_EXTRA = 49.9;

export function valorAddonCdFornecedorExtra(qtdFornecedoresExtra: number): number {
  if (!Number.isFinite(qtdFornecedoresExtra) || qtdFornecedoresExtra <= 0) return 0;
  return Math.round(qtdFornecedoresExtra * VALOR_ADDON_CD_FORNECEDOR_EXTRA * 100) / 100;
}

export type VinculoCdParaCobranca = { vinculado_em: string; cortesia: boolean; cortesia_ate: string | null };

/**
 * Quantos vínculos do CD de um seller são cobráveis: o mais antigo (1º) está incluso na
 * mensalidade normal, cada um a mais cobra — exceto se a cortesia daquela linha específica
 * estiver vigente na data de referência. Mesma regra usada na geração real da mensalidade
 * (`gerarMensalidadesParaOrgCiclo`) — reaproveitar aqui evita a tela mostrar um número
 * diferente do que realmente vai ser cobrado.
 */
export function qtdFornecedorCdExtraCobravel(vinculos: VinculoCdParaCobranca[], hojeYmd: string): number {
  const ordenada = [...vinculos].sort((a, b) => a.vinculado_em.localeCompare(b.vinculado_em));
  const extras = ordenada.slice(1);
  return extras.filter((v) => !(v.cortesia && (!v.cortesia_ate || v.cortesia_ate >= hojeYmd))).length;
}

/**
 * Quantos vínculos extras (2º em diante) estão isentos por cortesia vigente — só pra
 * exibição (ex.: `/seller/plano` mostrar "isento por cortesia" em vez de simplesmente
 * sumir a linha quando a cortesia zera o valor cobrável). Não usar pra cálculo de cobrança,
 * só `qtdFornecedorCdExtraCobravel` é fonte de verdade pra isso.
 */
export function qtdFornecedorCdExtraCortesia(vinculos: VinculoCdParaCobranca[], hojeYmd: string): number {
  const ordenada = [...vinculos].sort((a, b) => a.vinculado_em.localeCompare(b.vinculado_em));
  const extras = ordenada.slice(1);
  return extras.filter((v) => v.cortesia && (!v.cortesia_ate || v.cortesia_ate >= hojeYmd)).length;
}
