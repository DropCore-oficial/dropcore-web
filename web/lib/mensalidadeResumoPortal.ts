import { isPortalTrialAtivo } from "@/lib/portalTrial";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type MensalidadePortalContagem = { em_teste: number; adimplentes: number; inadimplentes: number };

/**
 * Por entidade ativa: em teste grátis, inadimplente (mensalidade vencida não paga), ou adimplente.
 * Quem está em teste não conta como inadimplente neste resumo.
 */
export async function resumoMensalidadePortal(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ sellers: MensalidadePortalContagem; fornecedores: MensalidadePortalContagem }> {
  const [{ data: sellers }, { data: forns }, { data: inadRows }] = await Promise.all([
    supabase.from("sellers").select("id, trial_valido_ate").eq("org_id", orgId).ilike("status", "ativo"),
    supabase.from("fornecedores").select("id, trial_valido_ate").eq("org_id", orgId).ilike("status", "ativo"),
    supabase.from("financial_mensalidades").select("tipo, entidade_id").eq("org_id", orgId).eq("status", "inadimplente"),
  ]);

  const inadSeller = new Set<string>();
  const inadForn = new Set<string>();
  for (const r of inadRows ?? []) {
    if (r.tipo === "seller") inadSeller.add(r.entidade_id as string);
    else if (r.tipo === "fornecedor") inadForn.add(r.entidade_id as string);
  }

  function contar(
    rows: { id: string; trial_valido_ate?: string | null }[] | null,
    inadSet: Set<string>
  ): MensalidadePortalContagem {
    let em_teste = 0;
    let inadimplentes = 0;
    let adimplentes = 0;
    for (const r of rows ?? []) {
      if (isPortalTrialAtivo(r.trial_valido_ate)) {
        em_teste++;
      } else if (inadSet.has(r.id)) {
        inadimplentes++;
      } else {
        adimplentes++;
      }
    }
    return { em_teste, adimplentes, inadimplentes };
  }

  return {
    sellers: contar(sellers ?? [], inadSeller),
    fornecedores: contar(forns ?? [], inadForn),
  };
}
