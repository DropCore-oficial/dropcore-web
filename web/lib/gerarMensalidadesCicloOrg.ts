import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampMensalidadeDiaVencimento, hojeYmdSaoPaulo, vencimentoEmNoCiclo } from "@/lib/mensalidadeDiaVencimento";
import { isPortalTrialAtivo } from "@/lib/portalTrial";

const VALOR_DEFAULT_SELLER = 97.9;
const VALOR_DEFAULT_FORNECEDOR = 97.9;

export type GerarMensalidadesCicloResult =
  | { ok: true; ciclo: string; geradas: number; message?: string }
  | { ok: false; ciclo: string; geradas: 0; error: string };

/**
 * Gera (upsert) mensalidades do mês para todos sellers/fornecedores ativos da org.
 * `cicloYYYY_MM` = "YYYY-MM" (vencimento por entidade: coluna mensalidade_dia_vencimento ou 10 se null).
 *
 * Quem já tem mensalidade `inadimplente` em aberto (de qualquer ciclo anterior) não ganha
 * ciclo novo — a entidade fica bloqueada sem acumular mais cobrança enquanto não regulariza.
 * Quando a dívida antiga é quitada no meio do mês, não retroage o ciclo corrente se o
 * vencimento dele já passou (evita nascer uma cobrança já vencida na hora); nesse caso o
 * próximo ciclo só nasce no mês seguinte, com vencimento no futuro.
 *
 * Quem está em teste grátis do portal (trial_valido_ate no futuro) também não ganha ciclo
 * novo — sem isso, o cron criaria uma linha por mês só pra `cancelarMensalidadesDuranteTrial`
 * cancelar em seguida, poluindo o histórico com uma linha "Cancelado" repetida todo mês.
 */
export async function gerarMensalidadesParaOrgCiclo(orgId: string, cicloYYYY_MM: string): Promise<GerarMensalidadesCicloResult> {
  const cicloStr = cicloYYYY_MM.trim().slice(0, 7);
  if (!cicloStr || !/^\d{4}-\d{2}$/.test(cicloStr)) {
    return { ok: false, ciclo: "", geradas: 0, error: "ciclo (YYYY-MM) inválido." };
  }
  const primeiroDia = cicloStr + "-01";
  const hoje = hojeYmdSaoPaulo();

  const [{ data: planos }, sellersRes, fornRes, inadRes, cicloAtualRes] = await Promise.all([
    supabaseAdmin.from("financial_planos").select("plano, valor_seller, valor_fornecedor"),
    supabaseAdmin.from("sellers").select("id, nome, plano, mensalidade_dia_vencimento, trial_valido_ate").eq("org_id", orgId).ilike("status", "ativo"),
    supabaseAdmin.from("fornecedores").select("id, nome, mensalidade_dia_vencimento, trial_valido_ate").eq("org_id", orgId).ilike("status", "ativo"),
    supabaseAdmin.from("financial_mensalidades").select("tipo, entidade_id").eq("org_id", orgId).eq("status", "inadimplente"),
    supabaseAdmin.from("financial_mensalidades").select("tipo, entidade_id").eq("org_id", orgId).eq("ciclo", primeiroDia),
  ]);
  const planosMap = new Map((planos ?? []).map((p) => [p.plano, p]));

  const sellers = sellersRes.data ?? [];
  const fornecedores = fornRes.data ?? [];

  const inadSellerIds = new Set(
    (inadRes.data ?? []).filter((r) => r.tipo === "seller").map((r) => r.entidade_id)
  );
  const inadFornIds = new Set(
    (inadRes.data ?? []).filter((r) => r.tipo === "fornecedor").map((r) => r.entidade_id)
  );
  const jaTemCicloSeller = new Set(
    (cicloAtualRes.data ?? []).filter((r) => r.tipo === "seller").map((r) => r.entidade_id)
  );
  const jaTemCicloForn = new Set(
    (cicloAtualRes.data ?? []).filter((r) => r.tipo === "fornecedor").map((r) => r.entidade_id)
  );

  const rows: { org_id: string; tipo: string; entidade_id: string; ciclo: string; valor: number; vencimento_em: string }[] = [];

  for (const s of sellers) {
    if (inadSellerIds.has(s.id)) continue;
    if (isPortalTrialAtivo((s as { trial_valido_ate?: string | null }).trial_valido_ate)) continue;
    const p = (s.plano?.trim() || "").toLowerCase();
    const planoKey = p === "pro" ? "Pro" : p === "starter" ? "Starter" : "default";
    const pc = planosMap.get(planoKey) ?? planosMap.get("default");
    const valor = pc ? Number(pc.valor_seller) : VALOR_DEFAULT_SELLER;
    const diaRaw = (s as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    const vencimento_em = vencimentoEmNoCiclo(primeiroDia, dia);
    if (!jaTemCicloSeller.has(s.id) && vencimento_em < hoje) continue;
    rows.push({
      org_id: orgId,
      tipo: "seller",
      entidade_id: s.id,
      ciclo: primeiroDia,
      valor,
      vencimento_em,
    });
  }
  for (const f of fornecedores) {
    if (inadFornIds.has(f.id)) continue;
    if (isPortalTrialAtivo((f as { trial_valido_ate?: string | null }).trial_valido_ate)) continue;
    const pc = planosMap.get("default");
    const valor = pc ? Number(pc.valor_fornecedor) : VALOR_DEFAULT_FORNECEDOR;
    const diaRaw = (f as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    const vencimento_em = vencimentoEmNoCiclo(primeiroDia, dia);
    if (!jaTemCicloForn.has(f.id) && vencimento_em < hoje) continue;
    rows.push({
      org_id: orgId,
      tipo: "fornecedor",
      entidade_id: f.id,
      ciclo: primeiroDia,
      valor,
      vencimento_em,
    });
  }

  if (rows.length === 0) {
    return {
      ok: true,
      ciclo: primeiroDia,
      geradas: 0,
      message: "Nenhuma mensalidade nova: sem seller/fornecedor ativo elegível (inadimplente em aberto não gera ciclo novo).",
    };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("financial_mensalidades")
    .upsert(rows, { onConflict: "tipo,entidade_id,ciclo", ignoreDuplicates: false })
    .select("id");

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return {
        ok: false,
        ciclo: primeiroDia,
        geradas: 0,
        error: "Tabela financial_mensalidades não existe. Execute create-mensalidades.sql.",
      };
    }
    return { ok: false, ciclo: primeiroDia, geradas: 0, error: error.message };
  }

  return {
    ok: true,
    ciclo: primeiroDia,
    geradas: inserted?.length ?? rows.length,
  };
}
