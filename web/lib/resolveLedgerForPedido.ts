/**
 * Resolve o(s) financial_ledger de um pedido — pode ser mais de 1 desde que um pedido
 * passou a poder ter itens de fornecedores diferentes do CD (1 linha de ledger por
 * fornecedor presente, ver blockSale.ts). Pedido avulso/CD-com-1-fornecedor continua
 * resolvendo array de 1 elemento, comportamento idêntico ao de antes.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export async function resolveLedgerIdsForPedido(
  org_id: string,
  pedido_id: string,
  explicit_ledger_id: string | null
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("financial_ledger")
    .select("id")
    .eq("org_id", org_id)
    .eq("pedido_id", pedido_id)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .eq("status", "BLOQUEADO")
    .order("data_evento", { ascending: false });

  if (data?.length) return data.map((row) => row.id as string);

  if (explicit_ledger_id) return [explicit_ledger_id];

  /* Legado: pedido_id não preenchido no ledger, mas referência do block-sale */
  const ref = `pedido ${pedido_id}`;
  const { data: byRef } = await supabaseAdmin
    .from("financial_ledger")
    .select("id")
    .eq("org_id", org_id)
    .eq("referencia", ref)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .eq("status", "BLOQUEADO")
    .order("data_evento", { ascending: false });

  return (byRef ?? []).map((row) => row.id as string);
}

/** Compat: primeira/representativa, pra código que ainda não foi migrado pro array. */
export async function resolveLedgerIdForPedido(
  org_id: string,
  pedido_id: string,
  explicit_ledger_id: string | null
): Promise<string | null> {
  const ids = await resolveLedgerIdsForPedido(org_id, pedido_id, explicit_ledger_id);
  return ids[0] ?? null;
}
