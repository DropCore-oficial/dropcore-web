import type { SupabaseClient } from "@supabase/supabase-js";
import { portalTrialEndIsoFromConviteDias } from "@/lib/portalTrial";

/**
 * Aplica `trial_valido_ate` na primeira ativação conforme dias do convite.
 * `dias === 0` → `trial_valido_ate` null (sem teste). `dias > 0` → só define se ainda estava vazio.
 */
export async function applyPortalTrialFromInviteForSeller(
  sb: SupabaseClient,
  sellerId: string,
  portalTrialDias: number,
): Promise<void> {
  const iso = portalTrialEndIsoFromConviteDias(portalTrialDias);
  if (iso === null) {
    await sb.from("sellers").update({ trial_valido_ate: null }).eq("id", sellerId);
    return;
  }
  const { data: row } = await sb.from("sellers").select("trial_valido_ate").eq("id", sellerId).maybeSingle();
  const cur = (row as { trial_valido_ate?: string | null } | null)?.trial_valido_ate ?? null;
  if (!cur) {
    await sb.from("sellers").update({ trial_valido_ate: iso }).eq("id", sellerId);
  }
}

export async function applyPortalTrialFromInviteForFornecedor(
  sb: SupabaseClient,
  fornecedorId: string,
  portalTrialDias: number,
): Promise<void> {
  const iso = portalTrialEndIsoFromConviteDias(portalTrialDias);
  if (iso === null) {
    await sb.from("fornecedores").update({ trial_valido_ate: null }).eq("id", fornecedorId);
    return;
  }
  const { data: row } = await sb.from("fornecedores").select("trial_valido_ate").eq("id", fornecedorId).maybeSingle();
  const cur = (row as { trial_valido_ate?: string | null } | null)?.trial_valido_ate ?? null;
  if (!cur) {
    await sb.from("fornecedores").update({ trial_valido_ate: iso }).eq("id", fornecedorId);
  }
}
