import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contarInadimplentes, marcarInadimplentes, reverterInadimplentesDuranteTrial } from "@/lib/inadimplencia";
import { syncInadimplentesOrgAdminNotifications } from "@/lib/inadimplenciaOrgNotifications";
import { enviarEmailsMensalidadeVencida, enviarEmailsMensalidadeVencendo } from "@/lib/mensalidadeVencimentoEmail";

async function distinctOrgIds(): Promise<string[]> {
  const [{ data: s }, { data: f }] = await Promise.all([
    supabaseAdmin.from("sellers").select("org_id").not("org_id", "is", null),
    supabaseAdmin.from("fornecedores").select("org_id").not("org_id", "is", null),
  ]);
  const set = new Set<string>();
  for (const r of s ?? []) {
    const id = (r as { org_id?: string }).org_id;
    if (id) set.add(id);
  }
  for (const r of f ?? []) {
    const id = (r as { org_id?: string }).org_id;
    if (id) set.add(id);
  }
  return [...set];
}

export type RunInadimplenciaResult = {
  orgs: number;
  marcados_total: number;
  erros: { org_id: string; error: string }[];
};

/**
 * Marca inadimplentes + notifica admins — para cron horário (não em GET de dashboard).
 */
export async function runInadimplenciaTodasOrgs(): Promise<RunInadimplenciaResult> {
  const orgIds = await distinctOrgIds();
  let marcados_total = 0;
  const erros: { org_id: string; error: string }[] = [];

  for (const org_id of orgIds) {
    try {
      await reverterInadimplentesDuranteTrial(supabaseAdmin, org_id);
      const marcados = await marcarInadimplentes(supabaseAdmin, org_id);
      marcados_total += marcados.length;
      if (marcados.length) await enviarEmailsMensalidadeVencida(marcados);
      await enviarEmailsMensalidadeVencendo(org_id);
      const inad = await contarInadimplentes(supabaseAdmin, org_id);
      await syncInadimplentesOrgAdminNotifications(supabaseAdmin, org_id, inad);
    } catch (e: unknown) {
      erros.push({
        org_id,
        error: e instanceof Error ? e.message : "Erro",
      });
    }
  }

  return { orgs: orgIds.length, marcados_total, erros };
}
