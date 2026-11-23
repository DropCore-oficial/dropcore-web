import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Lista de fornecedores que o seller pode comprar/vender hoje: todo vínculo ativo (avulso
 * OU, se não tiver avulso, os vínculos ativos do CD) vive em `seller_fornecedor_vinculos` —
 * fonte única desde a unificação (fn_seller_fornecedor_vincular/_desvincular), nunca mais
 * `sellers.fornecedor_id` direto (isso agora é só cache derivado, lido em outras telas).
 */
export async function resolverFornecedoresAtivosDoSeller(params: { seller_id: string; org_id: string }): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("seller_fornecedor_vinculos")
    .select("fornecedor_id")
    .eq("seller_id", params.seller_id)
    .eq("org_id", params.org_id)
    .is("desvinculado_em", null);

  return (data ?? []).map((r) => r.fornecedor_id as string);
}
