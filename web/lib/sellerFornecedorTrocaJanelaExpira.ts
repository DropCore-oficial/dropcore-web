import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DIAS_JANELA_ESCOLHA_FORNECEDOR, MESES_MINIMOS_COM_FORNECEDOR } from "@/lib/sellerFornecedorVinculo";

const BATCH_SIZE = 200;

export type FornecedorTrocaJanelaExpiraResult = {
  processados: number;
  falhas: string[];
};

/**
 * Tranca de novo, sozinho, o seller que ficou livre pra trocar de fornecedor e não agiu em
 * DIAS_JANELA_ESCOLHA_FORNECEDOR dias — reinicia o compromisso mínimo com o fornecedor atual
 * (`fornecedor_vinculado_em = agora`). Dois motivos possíveis pra estar livre, tratados em
 * duas buscas separadas (o resultado é o mesmo update nos dois casos):
 *
 * 1) Liberação antecipada do admin (`fornecedor_desvinculo_liberado = true`) concedida há mais
 *    de DIAS_JANELA_ESCOLHA_FORNECEDOR dias (`fornecedor_desvinculo_liberado_em`).
 * 2) Vencimento natural dos MESES_MINIMOS_COM_FORNECEDOR (sem liberação antecipada ativa) há
 *    mais de DIAS_JANELA_ESCOLHA_FORNECEDOR dias além do prazo mínimo.
 */
export async function processarFornecedorTrocaJanelaExpiraCron(): Promise<FornecedorTrocaJanelaExpiraResult> {
  const result: FornecedorTrocaJanelaExpiraResult = { processados: 0, falhas: [] };
  const agora = new Date();

  // Caso 1: liberação antecipada não usada em DIAS_JANELA_ESCOLHA_FORNECEDOR dias.
  const limiteLiberado = new Date(agora.getTime() - DIAS_JANELA_ESCOLHA_FORNECEDOR * 24 * 60 * 60 * 1000).toISOString();
  const { data: liberados, error: errLiberados } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id")
    .eq("fornecedor_desvinculo_liberado", true)
    .not("fornecedor_id", "is", null)
    .lt("fornecedor_desvinculo_liberado_em", limiteLiberado)
    .limit(BATCH_SIZE);

  if (errLiberados) {
    result.falhas.push(`Erro ao buscar liberações antecipadas expiradas: ${errLiberados.message}`);
  }

  // Caso 2: prazo mínimo natural vencido há mais de DIAS_JANELA_ESCOLHA_FORNECEDOR dias, sem
  // liberação antecipada ativa (esse caso já é coberto pela busca acima).
  const limiteNatural = new Date(agora.getTime() - DIAS_JANELA_ESCOLHA_FORNECEDOR * 24 * 60 * 60 * 1000);
  limiteNatural.setMonth(limiteNatural.getMonth() - MESES_MINIMOS_COM_FORNECEDOR);
  const { data: naturais, error: errNaturais } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id")
    .eq("fornecedor_desvinculo_liberado", false)
    .not("fornecedor_id", "is", null)
    .not("fornecedor_vinculado_em", "is", null)
    .lt("fornecedor_vinculado_em", limiteNatural.toISOString())
    .limit(BATCH_SIZE);

  if (errNaturais) {
    result.falhas.push(`Erro ao buscar vínculos com prazo natural vencido: ${errNaturais.message}`);
  }

  const sellersUnicos = new Map<string, string>();
  for (const row of liberados ?? []) sellersUnicos.set(row.id as string, row.org_id as string);
  for (const row of naturais ?? []) sellersUnicos.set(row.id as string, row.org_id as string);

  for (const [sellerId, orgId] of sellersUnicos) {
    // Fonte real do compromisso agora é a linha de vínculo, não sellers direto (que é só
    // cache, sincronizado pela própria RPC abaixo).
    const { data: vinculoRow, error: vinculoErr } = await supabaseAdmin
      .from("seller_fornecedor_vinculos")
      .select("id")
      .eq("seller_id", sellerId)
      .is("desvinculado_em", null)
      .maybeSingle();
    if (vinculoErr) {
      result.falhas.push(`Seller ${sellerId}: ${vinculoErr.message}`);
      continue;
    }
    if (!vinculoRow) {
      // Cache desatualizada sem vínculo ativo correspondente (não deveria acontecer com o
      // fluxo novo) — não há o que renovar.
      continue;
    }
    const { data: renovado, error: renovarErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_renovar_compromisso", {
      p_vinculo_id: (vinculoRow as { id: string }).id,
      p_org_id: orgId,
    });
    if (renovarErr) {
      result.falhas.push(`Seller ${sellerId}: ${renovarErr.message}`);
      continue;
    }
    const resultRpc = renovado as { ok: boolean; error_code?: string };
    if (!resultRpc.ok) {
      result.falhas.push(`Seller ${sellerId}: ${resultRpc.error_code ?? "falha ao renovar compromisso"}`);
      continue;
    }
    result.processados++;
  }

  return result;
}
