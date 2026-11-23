import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export type CobrancaVinculoResultado =
  | { opera_no_cd: false }
  | { opera_no_cd: true; incluso: true }
  | { opera_no_cd: true; incluso: false; isento_cortesia: true; cortesia_ate: string | null }
  | { opera_no_cd: true; incluso: false; isento_cortesia: false; valor: number };

/**
 * Resolve, pro vínculo que acabou de ser criado (seller ou admin), se ele é o 1º fornecedor
 * do CD do seller (incluso, sem custo extra), se é extra mas está isento por cortesia, ou se
 * vai mesmo somar `VALOR_ADDON_CD_FORNECEDOR_EXTRA`/mês a partir do próximo ciclo — usado
 * pra deixar isso claro na notificação (sino + e-mail), nunca deixar o seller descobrir só
 * quando a mensalidade chegar maior.
 */
export async function resolverCobrancaVinculoCd(params: {
  seller_id: string;
  org_id: string;
  fornecedor_id: string;
}): Promise<CobrancaVinculoResultado> {
  const { data: forn } = await supabaseAdmin
    .from("fornecedores")
    .select("opera_no_cd")
    .eq("id", params.fornecedor_id)
    .maybeSingle();
  if (!forn?.opera_no_cd) return { opera_no_cd: false };

  const { data: vinculosRows } = await supabaseAdmin
    .from("seller_fornecedor_vinculos")
    .select("fornecedor_id, vinculado_em, cortesia, cortesia_ate, fornecedores(opera_no_cd)")
    .eq("seller_id", params.seller_id)
    .eq("org_id", params.org_id)
    .is("desvinculado_em", null);

  type Row = {
    fornecedor_id: string;
    vinculado_em: string;
    cortesia: boolean;
    cortesia_ate: string | null;
    fornecedores: { opera_no_cd: boolean } | null;
  };
  const cdVinculos = ((vinculosRows ?? []) as unknown as Row[])
    .filter((v) => v.fornecedores?.opera_no_cd === true)
    .sort((a, b) => a.vinculado_em.localeCompare(b.vinculado_em));

  const idx = cdVinculos.findIndex((v) => v.fornecedor_id === params.fornecedor_id);
  if (idx <= 0) return { opera_no_cd: true, incluso: true };

  const v = cdVinculos[idx];
  const hojeYmd = new Date().toISOString().slice(0, 10);
  const isentoCortesia = Boolean(v.cortesia && (!v.cortesia_ate || v.cortesia_ate >= hojeYmd));
  if (isentoCortesia) return { opera_no_cd: true, incluso: false, isento_cortesia: true, cortesia_ate: v.cortesia_ate };
  return { opera_no_cd: true, incluso: false, isento_cortesia: false, valor: VALOR_ADDON_CD_FORNECEDOR_EXTRA };
}

export function mensagemCobrancaVinculo(r: CobrancaVinculoResultado): string {
  if (!r.opera_no_cd) return "";
  if (r.incluso) return " Incluso na sua mensalidade, sem custo extra.";
  if (r.isento_cortesia) {
    return r.cortesia_ate
      ? ` Isento de cobrança por cortesia até ${new Date(`${r.cortesia_ate}T00:00:00`).toLocaleDateString("pt-BR")}.`
      : " Isento de cobrança por cortesia.";
  }
  const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.valor);
  return ` Por ser mais de 1 fornecedor do Centro de Distribuição, isso soma ${valorBRL}/mês a partir da sua próxima mensalidade.`;
}
