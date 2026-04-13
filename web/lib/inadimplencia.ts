/**
 * Inadimplência: marca mensalidades vencidas e verifica bloqueio.
 *
 * Regra: vencimento_em < hoje e status = pendente → inadimplente,
 * exceto quem ainda está em teste grátis do portal (trial_valido_ate > agora):
 * nesse caso não há cobrança efetiva — não marca inadimplente nem bloqueia pedidos.
 */

import { isPortalTrialAtivo } from "@/lib/portalTrial";
import { resumoMensalidadePortal } from "@/lib/mensalidadeResumoPortal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const agoraIso = () => new Date().toISOString();

/** IDs de sellers/fornecedores com trial de portal ainda ativo (não cobrar / não inadimplir). */
async function entidadesComTrialAtivo(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ forn: Set<string>; sell: Set<string> }> {
  const now = agoraIso();
  const [{ data: fornTrial }, { data: sellTrial }] = await Promise.all([
    supabase.from("fornecedores").select("id").eq("org_id", orgId).gt("trial_valido_ate", now),
    supabase.from("sellers").select("id").eq("org_id", orgId).gt("trial_valido_ate", now),
  ]);
  return {
    forn: new Set((fornTrial ?? []).map((r: { id: string }) => r.id)),
    sell: new Set((sellTrial ?? []).map((r: { id: string }) => r.id)),
  };
}

/**
 * Corrige linhas já gravadas como inadimplente enquanto o trial ainda está ativo → volta para pendente.
 */
export async function reverterInadimplentesDuranteTrial(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const { forn, sell } = await entidadesComTrialAtivo(supabase, orgId);
  let n = 0;
  if (forn.size > 0) {
    const { data, error } = await supabase
      .from("financial_mensalidades")
      .update({ status: "pendente" })
      .eq("org_id", orgId)
      .eq("tipo", "fornecedor")
      .eq("status", "inadimplente")
      .in("entidade_id", [...forn])
      .select("id");
    if (error) console.error("[inadimplencia] reverter forn:", error.message);
    else n += data?.length ?? 0;
  }
  if (sell.size > 0) {
    const { data, error } = await supabase
      .from("financial_mensalidades")
      .update({ status: "pendente" })
      .eq("org_id", orgId)
      .eq("tipo", "seller")
      .eq("status", "inadimplente")
      .in("entidade_id", [...sell])
      .select("id");
    if (error) console.error("[inadimplencia] reverter sell:", error.message);
    else n += data?.length ?? 0;
  }
  return n;
}

/**
 * Marca mensalidades pendentes vencidas como inadimplente (exceto entidades em trial de portal).
 */
export async function marcarInadimplentes(
  supabase: SupabaseClient,
  orgId: string
): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { forn, sell } = await entidadesComTrialAtivo(supabase, orgId);

  const { data: candidates, error: qErr } = await supabase
    .from("financial_mensalidades")
    .select("id, tipo, entidade_id")
    .eq("org_id", orgId)
    .eq("status", "pendente")
    .lt("vencimento_em", hoje);

  if (qErr || !candidates?.length) {
    if (qErr) console.error("[inadimplencia] Erro ao listar candidatos:", qErr.message);
    return 0;
  }

  const toMark = candidates.filter((r: { id: string; tipo: string; entidade_id: string }) => {
    if (r.tipo === "fornecedor" && forn.has(r.entidade_id)) return false;
    if (r.tipo === "seller" && sell.has(r.entidade_id)) return false;
    return true;
  });
  if (!toMark.length) return 0;

  const ids = toMark.map((r: { id: string }) => r.id);
  const { data, error } = await supabase
    .from("financial_mensalidades")
    .update({ status: "inadimplente" })
    .in("id", ids)
    .select("id");

  if (error) {
    console.error("[inadimplencia] Erro ao marcar:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Verifica se uma entidade tem mensalidade inadimplente **efetiva** (bloqueio).
 * Durante trial de portal não bloqueia, mesmo que exista linha antiga no banco.
 */
export async function isInadimplente(
  supabase: SupabaseClient,
  orgId: string,
  tipo: "seller" | "fornecedor",
  entidadeId: string
): Promise<boolean> {
  const table = tipo === "seller" ? "sellers" : "fornecedores";
  const { data: ent } = await supabase.from(table).select("trial_valido_ate").eq("id", entidadeId).maybeSingle();
  if (isPortalTrialAtivo((ent as { trial_valido_ate?: string | null } | null)?.trial_valido_ate)) {
    return false;
  }

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
 * Conta sellers/fornecedores inadimplentes **para exibição e alertas** —
 * alinhado ao resumo do portal: quem está em trial não conta.
 */
export async function contarInadimplentes(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ sellers: number; fornecedores: number }> {
  const resumo = await resumoMensalidadePortal(supabase, orgId);
  return {
    sellers: resumo.sellers.inadimplentes,
    fornecedores: resumo.fornecedores.inadimplentes,
  };
}
