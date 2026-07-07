import { isPortalTrialAtivo } from "@/lib/portalTrial";
import {
  buscarPagamentoMpAprovado,
  valorLiquidoRecebidoMp,
} from "@/lib/mercadoPagoValorRecebido";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

type MensalidadePagaRow = {
  id: string;
  valor: number;
  valor_liquido_mp?: number | null;
  mp_payment_id?: string | null;
};

type MensalidadeCicloRow = {
  tipo: string;
  entidade_id: string;
  valor: number;
  status: string;
};

export type MensalidadeEntidadeCadastro = {
  id: string;
  nome: string;
};

export type MensalidadeLinhaCiclo = {
  tipo: "seller" | "fornecedor";
  entidade_id: string;
  entidade_nome: string;
  status: string;
  valor: number;
};

export type MensalidadeTotaisFinanceiros = {
  /** Ciclo consultado (YYYY-MM-01). */
  ciclo: string;
  /** YYYY-MM para input type=month. */
  ciclo_ym: string;
  /** Sellers ativos na org (cadastro real). */
  sellers_ativos: number;
  /** Fornecedores ativos na org (cadastro real). */
  fornecedores_ativos: number;
  cadastro_sellers: MensalidadeEntidadeCadastro[];
  cadastro_fornecedores: MensalidadeEntidadeCadastro[];
  /** Linhas de mensalidade do ciclo consultado (com nome da entidade). */
  linhas_ciclo: MensalidadeLinhaCiclo[];
  /** Linhas geradas neste ciclo. */
  geradas_linhas_sellers: number;
  geradas_linhas_fornecedores: number;
  geradas_entidades_sellers: number;
  geradas_entidades_fornecedores: number;
  pago_bruto: number;
  pago_liquido: number;
  pago_qtd: number;
  pago_qtd_sellers: number;
  pago_qtd_fornecedores: number;
  /** PIX com mp_payment_id creditados no mês civil do ciclo (líquido). */
  caixa_liquido_mes: number;
  caixa_qtd: number;
  pendente_cobravel: number;
  pendente_em_teste: number;
  pendente_cobravel_sellers: number;
  pendente_cobravel_fornecedores: number;
  pendente_em_teste_sellers: number;
  pendente_em_teste_fornecedores: number;
  pendente_em_teste_qtd_sellers: number;
  pendente_em_teste_qtd_fornecedores: number;
  pendente_cobravel_qtd_sellers: number;
  pendente_cobravel_qtd_fornecedores: number;
  inadimplente_cobravel: number;
  inadimplente_em_teste: number;
  inadimplente_qtd_sellers: number;
  inadimplente_qtd_fornecedores: number;
  /** Meses com mensalidades geradas (YYYY-MM), mais recente primeiro. */
  ciclos_disponiveis: string[];
};

function isStatusAtivo(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "ativo";
}

export function cicloAtualYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function cicloYmParaPrimeiroDia(ym: string): string {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return `${cicloAtualYm()}-01`;
  return `${t}-01`;
}

export function parseCicloConsulta(cicloParam?: string | null): {
  ciclo: string;
  ciclo_ym: string;
  primeiroDiaMes: string;
  ultimoDiaMes: string;
} {
  const ym =
    cicloParam?.trim().slice(0, 7) && /^\d{4}-\d{2}$/.test(cicloParam.trim().slice(0, 7))
      ? cicloParam.trim().slice(0, 7)
      : cicloAtualYm();
  const [y, m] = ym.split("-").map(Number);
  const ciclo = `${ym}-01`;
  const primeiroDiaMes = new Date(y, m - 1, 1).toISOString();
  const ultimoDiaMes = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
  return { ciclo, ciclo_ym: ym, primeiroDiaMes, ultimoDiaMes };
}

function trialAtivoPorEntidade(
  tipo: string,
  entidadeId: string,
  sellersTrial: Map<string, string | null>,
  fornTrial: Map<string, string | null>
): boolean {
  if (tipo === "seller") return isPortalTrialAtivo(sellersTrial.get(entidadeId));
  if (tipo === "fornecedor") return isPortalTrialAtivo(fornTrial.get(entidadeId));
  return false;
}

async function resolverLiquidoMensalidadePaga(
  supabase: SupabaseClient,
  row: MensalidadePagaRow
): Promise<number> {
  const nominal = Number(row.valor ?? 0);
  if (row.valor_liquido_mp != null && Number.isFinite(Number(row.valor_liquido_mp))) {
    return Number(row.valor_liquido_mp);
  }
  const mpId = row.mp_payment_id?.trim();
  if (!mpId) return nominal;

  const payment = await buscarPagamentoMpAprovado(mpId);
  if (!payment) return nominal;

  const liquido = valorLiquidoRecebidoMp(payment);
  if (Number.isFinite(liquido) && liquido >= 0) {
    const { error } = await supabase
      .from("financial_mensalidades")
      .update({ valor_liquido_mp: liquido })
      .eq("id", row.id);
    if (error && !/valor_liquido_mp|does not exist/i.test(error.message ?? "")) {
      console.warn("[mensalidadeTotais] backfill valor_liquido_mp:", error.message);
    }
    return liquido;
  }
  return nominal;
}

async function somarBrutoELiquido(
  supabase: SupabaseClient,
  rows: MensalidadePagaRow[]
): Promise<{ bruto: number; liquido: number }> {
  let bruto = 0;
  let liquido = 0;
  for (const r of rows) {
    bruto += Number(r.valor ?? 0);
    liquido += await resolverLiquidoMensalidadePaga(supabase, r);
  }
  return { bruto, liquido };
}

/**
 * Resumo financeiro de mensalidades **de um ciclo (mês)** com contagens reais da org.
 */
export async function fetchMensalidadeTotaisFinanceirosOrg(
  supabase: SupabaseClient,
  orgId: string,
  cicloParam?: string | null
): Promise<MensalidadeTotaisFinanceiros> {
  const { ciclo, ciclo_ym, primeiroDiaMes, ultimoDiaMes } = parseCicloConsulta(cicloParam);

  const [
    { data: sellersRaw },
    { data: fornsRaw },
    { data: cicloRowsData },
    { data: pagasCiclo },
    { data: pagasCaixa },
    { data: ciclosRaw },
  ] = await Promise.all([
    supabase.from("sellers").select("id, nome, status, trial_valido_ate").eq("org_id", orgId),
    supabase.from("fornecedores").select("id, nome, status, trial_valido_ate").eq("org_id", orgId),
    supabase
      .from("financial_mensalidades")
      .select("tipo, entidade_id, valor, status")
      .eq("org_id", orgId)
      .eq("ciclo", ciclo),
    supabase
      .from("financial_mensalidades")
      .select("id, tipo, valor, valor_liquido_mp, mp_payment_id")
      .eq("org_id", orgId)
      .eq("status", "pago")
      .eq("ciclo", ciclo),
    supabase
      .from("financial_mensalidades")
      .select("id, valor, valor_liquido_mp, mp_payment_id")
      .eq("org_id", orgId)
      .eq("status", "pago")
      .not("mp_payment_id", "is", null)
      .gte("pago_em", primeiroDiaMes)
      .lte("pago_em", ultimoDiaMes),
    supabase
      .from("financial_mensalidades")
      .select("ciclo")
      .eq("org_id", orgId)
      .order("ciclo", { ascending: false })
      .limit(120),
  ]);

  const sellers = (sellersRaw ?? []).filter((s: { status?: string }) => isStatusAtivo(s.status));
  const forns = (fornsRaw ?? []).filter((f: { status?: string }) => isStatusAtivo(f.status));

  const sellersTrial = new Map<string, string | null>(
    (sellers ?? []).map((s: { id: string; nome?: string; trial_valido_ate?: string | null }) => [
      s.id,
      s.trial_valido_ate ?? null,
    ])
  );
  const fornTrial = new Map<string, string | null>(
    (forns ?? []).map((f: { id: string; nome?: string; trial_valido_ate?: string | null }) => [
      f.id,
      f.trial_valido_ate ?? null,
    ])
  );
  const sellerNomes = new Map<string, string>(
    (sellers ?? []).map((s: { id: string; nome?: string }) => [s.id, String(s.nome ?? "—").trim() || "—"])
  );
  const fornNomes = new Map<string, string>(
    (forns ?? []).map((f: { id: string; nome?: string }) => [f.id, String(f.nome ?? "—").trim() || "—"])
  );

  const cadastro_sellers: MensalidadeEntidadeCadastro[] = (sellers ?? [])
    .map((s: { id: string; nome?: string }) => ({
      id: s.id,
      nome: String(s.nome ?? "—").trim() || "—",
    }))
    .sort((a: MensalidadeEntidadeCadastro, b: MensalidadeEntidadeCadastro) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    );
  const cadastro_fornecedores: MensalidadeEntidadeCadastro[] = (forns ?? [])
    .map((f: { id: string; nome?: string }) => ({
      id: f.id,
      nome: String(f.nome ?? "—").trim() || "—",
    }))
    .sort((a: MensalidadeEntidadeCadastro, b: MensalidadeEntidadeCadastro) =>
      a.nome.localeCompare(b.nome, "pt-BR")
    );

  const cicloRowsList = (cicloRowsData ?? []) as MensalidadeCicloRow[];
  const entidadeIdsSellerCiclo = new Set(
    cicloRowsList.filter((r) => r.tipo === "seller").map((r) => r.entidade_id)
  );
  const entidadeIdsFornCiclo = new Set(
    cicloRowsList.filter((r) => r.tipo === "fornecedor").map((r) => r.entidade_id)
  );
  const missingSellerIds = [...entidadeIdsSellerCiclo].filter((id) => !sellerNomes.has(id));
  const missingFornIds = [...entidadeIdsFornCiclo].filter((id) => !fornNomes.has(id));
  if (missingSellerIds.length > 0) {
    const { data: extraSellers } = await supabase
      .from("sellers")
      .select("id, nome, status")
      .eq("org_id", orgId)
      .in("id", missingSellerIds);
    for (const s of extraSellers ?? []) {
      sellerNomes.set(s.id, `${String(s.nome ?? "—").trim() || "—"} (${String(s.status ?? "—")})`);
    }
  }
  if (missingFornIds.length > 0) {
    const { data: extraForns } = await supabase
      .from("fornecedores")
      .select("id, nome, status")
      .eq("org_id", orgId)
      .in("id", missingFornIds);
    for (const f of extraForns ?? []) {
      fornNomes.set(f.id, `${String(f.nome ?? "—").trim() || "—"} (${String(f.status ?? "—")})`);
    }
  }

  const linhas_ciclo: MensalidadeLinhaCiclo[] = [];

  const geradasSellerIds = new Set<string>();
  const geradasFornIds = new Set<string>();
  let geradas_linhas_sellers = 0;
  let geradas_linhas_fornecedores = 0;

  let pendente_cobravel = 0;
  let pendente_em_teste = 0;
  let pendente_cobravel_sellers = 0;
  let pendente_cobravel_fornecedores = 0;
  let pendente_em_teste_sellers = 0;
  let pendente_em_teste_fornecedores = 0;
  let inadimplente_cobravel = 0;
  let inadimplente_em_teste = 0;

  const emTesteSellerIds = new Set<string>();
  const emTesteFornIds = new Set<string>();
  const cobravelSellerIds = new Set<string>();
  const cobravelFornIds = new Set<string>();
  const inadSellerIds = new Set<string>();
  const inadFornIds = new Set<string>();

  for (const r of cicloRowsList) {
    const valor = Number(r.valor ?? 0);
    const emTeste = trialAtivoPorEntidade(r.tipo, r.entidade_id, sellersTrial, fornTrial);
    const status = r.status;
    const entidade_nome =
      r.tipo === "seller"
        ? sellerNomes.get(r.entidade_id) ?? "—"
        : fornNomes.get(r.entidade_id) ?? "—";

    linhas_ciclo.push({
      tipo: r.tipo === "fornecedor" ? "fornecedor" : "seller",
      entidade_id: r.entidade_id,
      entidade_nome,
      status,
      valor,
    });

    if (r.tipo === "seller") {
      geradas_linhas_sellers += 1;
      geradasSellerIds.add(r.entidade_id);
    } else if (r.tipo === "fornecedor") {
      geradas_linhas_fornecedores += 1;
      geradasFornIds.add(r.entidade_id);
    }

    if (status === "pago" || status === "cancelado") continue;

    if (status === "inadimplente") {
      if (emTeste) {
        inadimplente_em_teste += valor;
      } else {
        inadimplente_cobravel += valor;
        if (r.tipo === "seller") inadSellerIds.add(r.entidade_id);
        else if (r.tipo === "fornecedor") inadFornIds.add(r.entidade_id);
      }
      continue;
    }

    if (status !== "pendente") continue;

    if (emTeste) {
      pendente_em_teste += valor;
      if (r.tipo === "seller") {
        pendente_em_teste_sellers += valor;
        emTesteSellerIds.add(r.entidade_id);
      } else if (r.tipo === "fornecedor") {
        pendente_em_teste_fornecedores += valor;
        emTesteFornIds.add(r.entidade_id);
      }
    } else {
      pendente_cobravel += valor;
      if (r.tipo === "seller") {
        pendente_cobravel_sellers += valor;
        cobravelSellerIds.add(r.entidade_id);
      } else if (r.tipo === "fornecedor") {
        pendente_cobravel_fornecedores += valor;
        cobravelFornIds.add(r.entidade_id);
      }
    }
  }

  const pagasRows = (pagasCiclo ?? []) as (MensalidadePagaRow & { tipo?: string })[];
  const pago_qtd_sellers = pagasRows.filter((r) => r.tipo === "seller").length;
  const pago_qtd_fornecedores = pagasRows.filter((r) => r.tipo === "fornecedor").length;

  const cicloSomas = await somarBrutoELiquido(supabase, pagasRows);
  const caixaRows = (pagasCaixa ?? []) as MensalidadePagaRow[];
  const caixaSomas = await somarBrutoELiquido(supabase, caixaRows);

  const ciclosSet = new Set<string>();
  for (const row of ciclosRaw ?? []) {
    const c = String((row as { ciclo?: string }).ciclo ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(c)) ciclosSet.add(c);
  }
  if (!ciclosSet.has(ciclo_ym)) ciclosSet.add(ciclo_ym);
  const ciclos_disponiveis = [...ciclosSet].sort((a, b) => b.localeCompare(a));

  return {
    ciclo,
    ciclo_ym,
    sellers_ativos: cadastro_sellers.length,
    fornecedores_ativos: cadastro_fornecedores.length,
    cadastro_sellers,
    cadastro_fornecedores,
    linhas_ciclo,
    geradas_linhas_sellers,
    geradas_linhas_fornecedores,
    geradas_entidades_sellers: geradasSellerIds.size,
    geradas_entidades_fornecedores: geradasFornIds.size,
    pago_bruto: cicloSomas.bruto,
    pago_liquido: cicloSomas.liquido,
    pago_qtd: pagasRows.length,
    pago_qtd_sellers,
    pago_qtd_fornecedores,
    caixa_liquido_mes: caixaSomas.liquido,
    caixa_qtd: caixaRows.length,
    pendente_cobravel,
    pendente_em_teste,
    pendente_cobravel_sellers,
    pendente_cobravel_fornecedores,
    pendente_em_teste_sellers,
    pendente_em_teste_fornecedores,
    pendente_em_teste_qtd_sellers: emTesteSellerIds.size,
    pendente_em_teste_qtd_fornecedores: emTesteFornIds.size,
    pendente_cobravel_qtd_sellers: cobravelSellerIds.size,
    pendente_cobravel_qtd_fornecedores: cobravelFornIds.size,
    inadimplente_cobravel,
    inadimplente_em_teste,
    inadimplente_qtd_sellers: inadSellerIds.size,
    inadimplente_qtd_fornecedores: inadFornIds.size,
    ciclos_disponiveis,
  };
}
