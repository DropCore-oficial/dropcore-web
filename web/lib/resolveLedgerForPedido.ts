/**
 * Resolve o financial_ledger de um pedido quando pedidos.ledger_id está vazio
 * (dados legados ou vínculo não gravado), para manter extrato do seller alinhado ao pedido.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export async function resolveLedgerIdForPedido(
  org_id: string,
  pedido_id: string,
  explicit_ledger_id: string | null
): Promise<string | null> {
  if (explicit_ledger_id) return explicit_ledger_id;

  const base = () =>
    supabaseAdmin
      .from("financial_ledger")
      .select("id")
      .eq("org_id", org_id)
      .eq("pedido_id", pedido_id)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .eq("status", "BLOQUEADO")
      .order("data_evento", { ascending: false })
      .limit(1)
      .maybeSingle();

  const { data } = await base();
  if (data?.id) return data.id;

  /* Legado: pedido_id não preenchido no ledger, mas referência do block-sale */
  const ref = `pedido ${pedido_id}`;
  const { data: byRef } = await supabaseAdmin
    .from("financial_ledger")
    .select("id")
    .eq("org_id", org_id)
    .eq("referencia", ref)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .eq("status", "BLOQUEADO")
    .order("data_evento", { ascending: false })
    .limit(1)
    .maybeSingle();

  return byRef?.id ?? null;
}
