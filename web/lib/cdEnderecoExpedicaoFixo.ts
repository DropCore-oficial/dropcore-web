import { buildExpedicaoPadraoLinha, type ExpedicaoEnderecoParts } from "@/lib/expedicaoFornecedorFormat";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Endereço físico único do Centro de Distribuição DropCore — todo fornecedor que entra no
 * CD (`opera_no_cd=true`) passa a despachar por aqui, não mais do endereço próprio.
 * Decisão 2026-11-21: só sobrescreve `expedicao_*` (endereço de despacho/etiqueta) — o
 * cadastro/matriz do fornecedor (`endereco_*`) não muda.
 */
export const CD_EXPEDICAO_ENDERECO_FIXO: ExpedicaoEnderecoParts = {
  expedicao_logradouro: "RUA MANDAGUARI",
  expedicao_numero: "S/N",
  expedicao_complemento: "QUADRA 36 LOTE 10 SALA 07",
  expedicao_bairro: "SETOR JARDIM MARISTA",
  expedicao_cidade: "TRINDADE",
  expedicao_uf: "GO",
  expedicao_cep: "75383423",
};

export async function fornecedorOperaNoCd(fornecedorId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("fornecedores").select("opera_no_cd").eq("id", fornecedorId).maybeSingle();
  return Boolean((data as { opera_no_cd?: boolean | null } | null)?.opera_no_cd);
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Fornecedor no CD: o campo `logistica` de `detalhes_produto_json` passa a sempre refletir
 * o endereço fixo do CD — nunca o que o fornecedor digitar em "Endereço de despacho" na
 * criação/edição do produto (mesma regra travada no cadastro, ver `app/api/fornecedor/cadastro/route.ts`).
 */
export function aplicarLogisticaCdForcada(detalhesProdutoJson: unknown): Record<string, unknown> {
  const base = asObj(detalhesProdutoJson);
  const logisticaExistente = asObj(base.logistica);
  return {
    ...base,
    logistica: {
      ...logisticaExistente,
      cdUsarDespachoCadastro: true,
      cdSaida: buildExpedicaoPadraoLinha(CD_EXPEDICAO_ENDERECO_FIXO) ?? "",
      cdSaidaCep: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_cep,
      cdSaidaLogradouro: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_logradouro,
      cdSaidaNumero: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_numero,
      cdSaidaComplemento: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_complemento,
      cdSaidaBairro: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_bairro,
      cdSaidaCidade: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_cidade,
      cdSaidaUf: CD_EXPEDICAO_ENDERECO_FIXO.expedicao_uf,
    },
  };
}
