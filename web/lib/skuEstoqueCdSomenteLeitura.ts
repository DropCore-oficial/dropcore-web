import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ESTOQUE_CD_SOMENTE_LEITURA_MENSAGEM =
  "Estoque administrado pelo Centro de Distribuição — fale com a operação DropCore para ajustar.";

/**
 * SKU no CD: estoque_atual só é escrito pelas RPCs de conferência/baixa manual
 * (fn_cd_conferencia_confirmar / fn_cd_baixa_manual), nunca direto pelo fornecedor —
 * o número que vale pra vender é o conferido fisicamente na entrada, não o que ele digita.
 */
export async function assertEstoqueEditavelPeloFornecedor(
  fornecedorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("fornecedores")
    .select("opera_no_cd")
    .eq("id", fornecedorId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Erro ao verificar fornecedor." };
  }
  if (data?.opera_no_cd) {
    return { ok: false, error: ESTOQUE_CD_SOMENTE_LEITURA_MENSAGEM };
  }
  return { ok: true };
}
