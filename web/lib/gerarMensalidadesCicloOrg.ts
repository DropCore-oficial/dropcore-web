import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clampMensalidadeDiaVencimento, hojeYmdSaoPaulo, vencimentoEmNoCiclo } from "@/lib/mensalidadeDiaVencimento";
import { isPortalTrialAtivo } from "@/lib/portalTrial";
import { valorAddonGestoresIaPorPlano } from "@/lib/gestoresIaAddonPrecos";
import { qtdFornecedorCdExtraCobravel, valorAddonCdFornecedorExtra } from "@/lib/cdFornecedorExtraAddonPrecos";
import {
  calcularValorMensalSellerPlano,
  isSellerPlanoDescontoTipo,
  type SellerPlanoDescontoTipo,
} from "@/lib/sellerPlanoCicloDesconto";

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

  const [{ data: planos }, sellersRes, fornRes, inadRes, cicloAtualRes, vinculosCdRes] = await Promise.all([
    supabaseAdmin.from("financial_planos").select("plano, valor_seller, valor_fornecedor"),
    supabaseAdmin
      .from("sellers")
      .select(
        "id, nome, plano, mensalidade_dia_vencimento, trial_valido_ate, mensalidade_valor_travado, gestores_ia_addon_ativo, plano_ciclo, plano_ciclo_carencia_fim, plano_desconto_tipo, plano_desconto_valor, plano_ciclo_valor_travado, plano_ciclo_compromisso_fim"
      )
      .eq("org_id", orgId)
      .ilike("status", "ativo"),
    supabaseAdmin.from("fornecedores").select("id, nome, mensalidade_dia_vencimento, trial_valido_ate").eq("org_id", orgId).ilike("status", "ativo"),
    supabaseAdmin.from("financial_mensalidades").select("tipo, entidade_id").eq("org_id", orgId).eq("status", "inadimplente"),
    supabaseAdmin.from("financial_mensalidades").select("tipo, entidade_id, status").eq("org_id", orgId).eq("ciclo", primeiroDia),
    supabaseAdmin
      .from("seller_fornecedor_vinculos")
      .select("seller_id, vinculado_em, cortesia, cortesia_ate")
      .eq("org_id", orgId)
      .is("desvinculado_em", null),
  ]);
  const planosMap = new Map((planos ?? []).map((p) => [p.plano, p]));

  const sellers = sellersRes.data ?? [];
  const fornecedores = fornRes.data ?? [];

  // Fornecedor adicional do CD: o primeiro vínculo (mais antigo) de cada seller já está
  // incluso na mensalidade normal — só o 2º em diante cobra, e só se não tiver cortesia
  // vigente naquela linha específica (cortesia é por vínculo, não por seller inteiro).
  const vinculosPorSeller = new Map<string, { vinculado_em: string; cortesia: boolean; cortesia_ate: string | null }[]>();
  for (const v of vinculosCdRes.data ?? []) {
    const lista = vinculosPorSeller.get(v.seller_id) ?? [];
    lista.push({ vinculado_em: v.vinculado_em as string, cortesia: !!v.cortesia, cortesia_ate: (v.cortesia_ate as string | null) ?? null });
    vinculosPorSeller.set(v.seller_id, lista);
  }
  const qtdFornecedorExtraCobravelPorSeller = new Map<string, number>();
  for (const [sellerId, lista] of vinculosPorSeller) {
    qtdFornecedorExtraCobravelPorSeller.set(sellerId, qtdFornecedorCdExtraCobravel(lista, hoje));
  }

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
  // Status da mensalidade já existente neste ciclo, por entidade — achado real 2026-10-12:
  // reexecutar "Gerar mensalidades" fazia upsert incondicional e sobrescrevia o `valor` de
  // mensalidade já PAGA (ex.: seller mudou de plano no meio do mês), mentindo um valor que
  // nunca foi cobrado. Só pendente/inadimplente pode ter o valor recalculado; pago/cancelado
  // é estado final, nunca mais mexe.
  const MUTAVEL = new Set(["pendente", "inadimplente"]);
  const statusCicloSeller = new Map(
    (cicloAtualRes.data ?? []).filter((r) => r.tipo === "seller").map((r) => [r.entidade_id, r.status])
  );
  const statusCicloForn = new Map(
    (cicloAtualRes.data ?? []).filter((r) => r.tipo === "fornecedor").map((r) => [r.entidade_id, r.status])
  );

  const rows: { org_id: string; tipo: string; entidade_id: string; ciclo: string; valor: number; vencimento_em: string }[] = [];

  for (const s of sellers) {
    if (inadSellerIds.has(s.id)) continue;
    if (jaTemCicloSeller.has(s.id) && !MUTAVEL.has(statusCicloSeller.get(s.id) ?? "")) continue;
    if (isPortalTrialAtivo((s as { trial_valido_ate?: string | null }).trial_valido_ate)) continue;
    // Carência do ciclo semestral/anual (admin define em /admin/sellers) — nenhum seller em
    // ciclo "mensal" (padrão/legado) é afetado, carencia_fim fica sempre null pra eles.
    const planoCiclo = (s as { plano_ciclo?: string | null }).plano_ciclo ?? "mensal";
    const carenciaFim = (s as { plano_ciclo_carencia_fim?: string | null }).plano_ciclo_carencia_fim ?? null;
    if (planoCiclo !== "mensal" && carenciaFim && carenciaFim >= hoje) continue;
    const p = (s.plano?.trim() || "").toLowerCase();
    const planoKey = p === "pro" ? "Pro" : p === "starter" ? "Starter" : "default";
    const pc = planosMap.get(planoKey) ?? planosMap.get("default");
    // mensalidade_valor_travado, quando preenchido, é o TOTAL final já travado (achado
    // 2026-10-01: Galileus/Segatto precisavam de add-on ativo sem cobrança nenhuma — só
    // travar a base e somar o add-on em cima não dava R$0) — o add-on só soma em cima do
    // valor de tabela do plano, nunca em cima de um valor travado.
    const valorTravado = (s as { mensalidade_valor_travado?: number | string | null }).mensalidade_valor_travado;
    const addonAtivo = (s as { gestores_ia_addon_ativo?: boolean | null }).gestores_ia_addon_ativo === true;
    const addonValor = addonAtivo ? valorAddonGestoresIaPorPlano(p) : 0;
    const descontoTipoRaw = (s as { plano_desconto_tipo?: string | null }).plano_desconto_tipo ?? null;
    const descontoTipo: SellerPlanoDescontoTipo | null = isSellerPlanoDescontoTipo(descontoTipoRaw) ? descontoTipoRaw : null;
    const descontoValor = (s as { plano_desconto_valor?: number | string | null }).plano_desconto_valor;
    const valorBase = pc ? Number(pc.valor_seller) : VALOR_DEFAULT_SELLER;
    const valorComDesconto = calcularValorMensalSellerPlano(
      valorBase,
      descontoTipo,
      descontoValor != null ? Number(descontoValor) : null
    );
    // Durante o compromisso semestral/anual (plano_ciclo_compromisso_fim no futuro), o valor
    // fica travado no que foi calculado quando o admin definiu o ciclo/desconto
    // (plano_ciclo_valor_travado) — reajuste de financial_planos no meio do compromisso não
    // pega o seller de surpresa. Some o add-on igual ao caminho normal (não é o total final
    // tipo mensalidade_valor_travado, é só a trava do preço de tabela+desconto).
    const compromissoFim = (s as { plano_ciclo_compromisso_fim?: string | null }).plano_ciclo_compromisso_fim ?? null;
    const valorTravadoCiclo = (s as { plano_ciclo_valor_travado?: number | string | null }).plano_ciclo_valor_travado;
    const dentroDoCompromisso = planoCiclo !== "mensal" && !!compromissoFim && compromissoFim >= hoje && valorTravadoCiclo != null;
    const valorPlanoFinal = dentroDoCompromisso ? Number(valorTravadoCiclo) : valorComDesconto;
    const cdExtraValor = valorAddonCdFornecedorExtra(qtdFornecedorExtraCobravelPorSeller.get(s.id) ?? 0);
    const valor = valorTravado != null ? Number(valorTravado) : valorPlanoFinal + addonValor + cdExtraValor;
    const diaRaw = (s as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    const vencimento_em = vencimentoEmNoCiclo(primeiroDia, dia);
    if (!jaTemCicloSeller.has(s.id) && vencimento_em < hoje) continue;
    // valor_travado = 0 (Galileus/Segatto) é isenção de verdade, não "cobrança de R$0" —
    // criar a linha geraria `pendente` que o cron de inadimplência (lib/inadimplencia.ts)
    // marcaria `inadimplente` ao vencer (ele não olha o valor), bloqueando o portal de quem
    // devia ficar sempre liberado. Sem linha nenhuma, não tem o que vencer.
    if (valor === 0) continue;
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
    if (jaTemCicloForn.has(f.id) && !MUTAVEL.has(statusCicloForn.get(f.id) ?? "")) continue;
    if (isPortalTrialAtivo((f as { trial_valido_ate?: string | null }).trial_valido_ate)) continue;
    const pc = planosMap.get("default");
    const valor = pc ? Number(pc.valor_fornecedor) : VALOR_DEFAULT_FORNECEDOR;
    const diaRaw = (f as { mensalidade_dia_vencimento?: number | null }).mensalidade_dia_vencimento;
    const dia = diaRaw == null ? 10 : clampMensalidadeDiaVencimento(Number(diaRaw));
    const vencimento_em = vencimentoEmNoCiclo(primeiroDia, dia);
    if (!jaTemCicloForn.has(f.id) && vencimento_em < hoje) continue;
    // Decisão 2026-10-11: fornecedor não paga mais mensalidade (financial_planos.valor_fornecedor
    // zerado pra todos via plano "default"). Mesmo racional do valor_travado=0 do seller acima —
    // sem esse guard nasceria linha de R$0 que o cron de inadimplência (lib/inadimplencia.ts)
    // bloquearia ao vencer mesmo assim, já que ele não olha o valor.
    if (valor === 0) continue;
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
