import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DIAS_JANELA_ESCOLHA_FORNECEDOR, MESES_MINIMOS_COM_FORNECEDOR } from "@/lib/sellerFornecedorVinculo";

const BATCH_SIZE = 200;

export type FornecedorTrocaJanelaExpiraResult = {
  processados: number;
  falhas: string[];
};

function relockUpdate(agoraIso: string) {
  return {
    fornecedor_desvinculo_liberado: false,
    fornecedor_desvinculo_liberado_em: null,
    fornecedor_vinculado_em: agoraIso,
    atualizado_em: agoraIso,
  };
}

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
  const agoraIso = agora.toISOString();

  // Caso 1: liberação antecipada não usada em DIAS_JANELA_ESCOLHA_FORNECEDOR dias.
  const limiteLiberado = new Date(agora.getTime() - DIAS_JANELA_ESCOLHA_FORNECEDOR * 24 * 60 * 60 * 1000).toISOString();
  const { data: liberados, error: errLiberados } = await supabaseAdmin
    .from("sellers")
    .select("id")
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
    .select("id")
    .eq("fornecedor_desvinculo_liberado", false)
    .not("fornecedor_id", "is", null)
    .not("fornecedor_vinculado_em", "is", null)
    .lt("fornecedor_vinculado_em", limiteNatural.toISOString())
    .limit(BATCH_SIZE);

  if (errNaturais) {
    result.falhas.push(`Erro ao buscar vínculos com prazo natural vencido: ${errNaturais.message}`);
  }

  const idsUnicos = new Set<string>();
  for (const row of liberados ?? []) idsUnicos.add(row.id as string);
  for (const row of naturais ?? []) idsUnicos.add(row.id as string);

  for (const id of idsUnicos) {
    const { error: updateErr } = await supabaseAdmin.from("sellers").update(relockUpdate(agoraIso)).eq("id", id);
    if (updateErr) {
      result.falhas.push(`Seller ${id}: ${updateErr.message}`);
      continue;
    }
    result.processados++;
  }

  return result;
}
