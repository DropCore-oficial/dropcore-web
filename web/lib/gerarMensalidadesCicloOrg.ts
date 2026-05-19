import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampMensalidadeDiaVencimento, vencimentoEmNoCiclo } from "@/lib/mensalidadeDiaVencimento";

const VALOR_DEFAULT_SELLER = 97.9;
const VALOR_DEFAULT_FORNECEDOR = 97.9;

export type GerarMensalidadesCicloResult =
  | { ok: true; ciclo: string; geradas: number; message?: string }
  | { ok: false; ciclo: string; geradas: 0; error: string };

/**
 * Gera (upsert) mensalidades do mês para todos sellers/fornecedores ativos da org.
 * `cicloYYYY_MM` = "YYYY-MM" (vencimento por entidade: coluna mensalidade_dia_vencimento ou 10 se null).
 */
export async function gerarMensalidadesParaOrgCiclo(orgId: string, cicloYYYY_MM: string): Promise<GerarMensalidadesCicloResult> {
  const cicloStr = cicloYYYY_MM.trim().slice(0, 7);
  if (!cicloStr || !/^\d{4}-\d{2}$/.test(cicloStr)) {
    return { ok: false, ciclo: "", geradas: 0, error: "ciclo (YYYY-MM) inválido." };
  }
  const primeiroDia = cicloStr + "-01";

  const { data: planos } = await supabaseAdmin.from("financial_planos").select("plano, valor_seller, valor_fornecedor");
  const planosMap = new Map((planos ?? []).map((p) => [p.plano, p]));

  const [sellersRes, fornRes] = await Promise.all([
    supabaseAdmin.from("sellers").select("id, nome, plano, mensalidade_dia_vencimento").eq("org_id", orgId).ilike("status", "ativo"),
    supabaseAdmin.from("fornecedores").select("id, nome, mensalidade_dia_vencimento").eq("org_id", orgId).ilike("status", "ativo"),
  ]);

  const sellers = sellersRes.data ?? [];
  const fornecedores = fornRes.data ?? [];
  const rows: { org_id: string; tipo: string; entidade_id: string; ciclo: string; valor: number; vencimento_em: string }[] = [];

  for (const s of sellers) {
    const p = (s.plano?.trim() || "").toLowerCase();
    const planoKey = p === "pro" ? "Pro" : p === "starter" ? "Starter" : "default";
    const pc = planosMap.get(planoKey) ?? planosMap.get("default");
    const valor = pc ? Number(pc.valor_seller) : VALOR_DEFAULT_SELLER;
    const diaRaw = (s as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    rows.push({
      org_id: orgId,
      tipo: "seller",
      entidade_id: s.id,
      ciclo: primeiroDia,
      valor,
      vencimento_em: vencimentoEmNoCiclo(primeiroDia, dia),
    });
  }
  for (const f of fornecedores) {
    const pc = planosMap.get("default");
    const valor = pc ? Number(pc.valor_fornecedor) : VALOR_DEFAULT_FORNECEDOR;
    const diaRaw = (f as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    rows.push({
      org_id: orgId,
      tipo: "fornecedor",
      entidade_id: f.id,
      ciclo: primeiroDia,
      valor,
      vencimento_em: vencimentoEmNoCiclo(primeiroDia, dia),
    });
  }

  if (rows.length === 0) {
    return {
      ok: true,
      ciclo: primeiroDia,
      geradas: 0,
      message: "Nenhum seller ou fornecedor ativo para gerar mensalidades.",
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
