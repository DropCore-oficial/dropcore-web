import type { SupabaseClient } from "@supabase/supabase-js";
import { mensalidadeDiaVencimentoHojeSaoPaulo } from "@/lib/mensalidadeDiaVencimento";

/** Define `mensalidade_dia_vencimento` uma vez (dia atual em SP), se ainda for null. */
export async function ensureMensalidadeDiaVencimentoSeNull(
  sb: SupabaseClient,
  tipo: "seller" | "fornecedor",
  entidadeId: string,
): Promise<void> {
  const table = tipo === "seller" ? "sellers" : "fornecedores";
  const { data: row } = await sb.from(table).select("mensalidade_dia_vencimento").eq("id", entidadeId).maybeSingle();
  const cur = (row as { mensalidade_dia_vencimento?: number | null } | null)?.mensalidade_dia_vencimento;
  if (cur != null) return;
  const dia = mensalidadeDiaVencimentoHojeSaoPaulo();
  await sb.from(table).update({ mensalidade_dia_vencimento: dia }).eq("id", entidadeId);
}
