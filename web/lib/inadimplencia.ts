/**
 * Inadimplência: marca mensalidades vencidas e verifica bloqueio.
 *
 * Regra: vencimento_em < hoje e status = pendente → inadimplente.
 * Entidade inadimplente → não pode criar pedido.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Marca todas as mensalidades pendentes vencidas da org como inadimplente.
 * Retorna quantas foram atualizadas.
 */
export async function marcarInadimplentes(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("financial_mensalidades")
    .update({ status: "inadimplente" })
    .eq("org_id", orgId)
    .eq("status", "pendente")
    .lt("vencimento_em", hoje)
    .select("id");

  if (error) {
    console.error("[inadimplencia] Erro ao marcar:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Verifica se uma entidade (seller ou fornecedor) tem mensalidade inadimplente.
 */
export async function isInadimplente(
  supabase: SupabaseClient,
  orgId: string,
  tipo: "seller" | "fornecedor",
  entidadeId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("financial_mensalidades")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("tipo", tipo)
    .eq("entidade_id", entidadeId)
    .eq("status", "inadimplente");

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Conta quantos sellers e fornecedores inadimplentes a org tem.
 */
export async function contarInadimplentes(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ sellers: number; fornecedores: number }> {
  const { data, error } = await supabase
    .from("financial_mensalidades")
    .select("tipo, entidade_id")
    .eq("org_id", orgId)
    .eq("status", "inadimplente");

  if (error || !data) return { sellers: 0, fornecedores: 0 };

  const sellerIds = new Set<string>();
  const fornIds = new Set<string>();
  for (const r of data) {
    if (r.tipo === "seller") sellerIds.add(r.entidade_id);
    else fornIds.add(r.entidade_id);
  }

  return { sellers: sellerIds.size, fornecedores: fornIds.size };
}
