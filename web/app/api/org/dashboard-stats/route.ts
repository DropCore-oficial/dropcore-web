import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OrgAuthError, requireAdmin } from "@/lib/apiOrgAuth";
import { resumoMensalidadePortal } from "@/lib/mensalidadeResumoPortal";
import { diasAteVencimentoFromMin, fetchOrgDashboardStatsAgg } from "@/lib/orgDashboardRpc";
import { emptyRepasseFuturosPreview, loadOrgRepasseFuturosPreview } from "@/lib/orgRepasseFuturosPreview";
import { portalTrialDays } from "@/lib/portalTrial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIXO_OCULTO = "DJU999";

/** Próxima segunda (1ª opção “Próximas semanas” em /admin/repasse-fornecedor), alinhado ao front. */
function proximaSegundaFeira(): string {
  const hoje = new Date();
  const dia = hoje.getDay();
  const diffParaProxSeg = dia === 1 ? 7 : (8 - dia) % 7 || 7;
  const base = new Date(hoje);
  base.setDate(base.getDate() + diffParaProxSeg);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltou SUPABASE env.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const supabase = supabaseService();
    const { searchParams } = new URL(req.url);
    const repasseOnly = searchParams.get("repasse_only") === "1";
    const includeRepassePreview = searchParams.get("repasse_preview") !== "0";

    if (repasseOnly) {
      const hojePreview = new Date();
      hojePreview.setHours(0, 0, 0, 0);
      const hojeStr = hojePreview.toISOString().slice(0, 10);
      const preview = await loadOrgRepasseFuturosPreview(supabase, org_id, hojeStr);
      return NextResponse.json(preview);
    }

    const { data: org } = await supabase.from("orgs").select("plano").eq("id", org_id).maybeSingle();
    const plano = org?.plano ?? "starter";

    const now = new Date();
    const primeiroDiaMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const ultimoDiaMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const hojeInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const hojeFim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    const repasse_proximo_ciclo = proximaSegundaFeira();
    const hojePreview = new Date();
    hojePreview.setHours(0, 0, 0, 0);
    const hojeStrPreview = hojePreview.toISOString().slice(0, 10);

    const [rpcAgg, countsSettled, mensalidade_portal, cicloRepasseRowRes, repassePreviewRes] = await Promise.all([
      fetchOrgDashboardStatsAgg(org_id, primeiroDiaMes, ultimoDiaMes).catch(() => null),
      Promise.allSettled([
        supabase.from("fornecedores").select("id", { count: "exact", head: true }).eq("org_id", org_id),
        supabase.from("fornecedores").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo"),
        supabase.from("skus").select("id", { count: "exact", head: true }).eq("org_id", org_id).not("sku", "ilike", `${PREFIXO_OCULTO}%`),
        supabase.from("skus").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo").not("sku", "ilike", `${PREFIXO_OCULTO}%`),
        supabase.from("sellers").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo"),
        supabase.from("seller_depositos_pix").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
        supabase.from("financial_repasse_fornecedor").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org_id)
          .gte("criado_em", hojeInicio)
          .lte("criado_em", hojeFim),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org_id)
          .eq("status", "enviado"),
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org_id)
          .gte("criado_em", primeiroDiaMes)
          .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido"),
        supabase.from("sku_alteracoes_pendentes").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
      ]),
      resumoMensalidadePortal(supabase, org_id),
      supabase
        .from("financial_ciclos_repasse")
        .select("status")
        .eq("org_id", org_id)
        .eq("ciclo_repasse", repasse_proximo_ciclo)
        .maybeSingle(),
      includeRepassePreview
        ? loadOrgRepasseFuturosPreview(supabase, org_id, hojeStrPreview)
        : Promise.resolve(emptyRepasseFuturosPreview),
    ]);

    let agg = rpcAgg;
    if (!agg) {
      const [skusBaixo, sellersSaldos, entradaMesRes, mensalSellersRes, mensalFornRes, produtoCorRes] =
        await Promise.allSettled([
          supabase
            .from("skus")
            .select("id, estoque_atual, estoque_minimo")
            .eq("org_id", org_id)
            .not("sku", "ilike", `${PREFIXO_OCULTO}%`)
            .limit(2000),
          supabase.from("sellers").select("saldo_atual").eq("org_id", org_id),
          supabase
            .from("seller_depositos_pix")
            .select("valor")
            .eq("org_id", org_id)
            .eq("status", "aprovado")
            .not("aprovado_em", "is", null)
            .gte("aprovado_em", primeiroDiaMes)
            .lte("aprovado_em", ultimoDiaMes),
          supabase
            .from("financial_mensalidades")
            .select("valor")
            .eq("org_id", org_id)
            .eq("tipo", "seller")
            .eq("status", "pendente"),
          supabase
            .from("financial_mensalidades")
            .select("valor")
            .eq("org_id", org_id)
            .eq("tipo", "fornecedor")
            .eq("status", "pendente"),
          supabase
            .from("skus")
            .select("nome_produto, cor")
            .eq("org_id", org_id)
            .ilike("status", "ativo")
            .not("sku", "ilike", `${PREFIXO_OCULTO}%`),
        ]);

      const skusBaixoData =
        skusBaixo.status === "fulfilled" ? (skusBaixo.value as { data?: unknown[] }).data ?? [] : [];
      const estoque_baixo_fb = (
        skusBaixoData as { estoque_atual?: number | null; estoque_minimo?: number | null }[]
      ).filter((r) => {
        const min = r.estoque_minimo;
        const atual = r.estoque_atual;
        return min != null && atual != null && Number(atual) < Number(min);
      }).length;

      const saldo_fb =
        sellersSaldos.status === "fulfilled" &&
        Array.isArray((sellersSaldos.value as { data?: { saldo_atual: number }[] }).data)
          ? ((sellersSaldos.value as { data: { saldo_atual: number }[] }).data || []).reduce(
              (s, r) => s + Number(r.saldo_atual || 0),
              0
            )
          : 0;

      const entradaMesData =
        entradaMesRes.status === "fulfilled" &&
        Array.isArray((entradaMesRes.value as { data?: { valor: number }[] }).data)
          ? (entradaMesRes.value as { data: { valor: number }[] }).data || []
          : [];
      const entrada_fb = entradaMesData.reduce((s, r) => s + Number(r.valor || 0), 0);

      const mensalSellersData =
        mensalSellersRes.status === "fulfilled" &&
        Array.isArray((mensalSellersRes.value as { data?: { valor: number }[] }).data)
          ? (mensalSellersRes.value as { data: { valor: number }[] }).data ?? []
          : [];
      const mensalFornData =
        mensalFornRes.status === "fulfilled" &&
        Array.isArray((mensalFornRes.value as { data?: { valor: number }[] }).data)
          ? (mensalFornRes.value as { data: { valor: number }[] }).data ?? []
          : [];

      const produtoCorData =
        produtoCorRes.status === "fulfilled" &&
        Array.isArray((produtoCorRes.value as { data?: { nome_produto?: string | null; cor?: string | null }[] }).data)
          ? (produtoCorRes.value as { data: { nome_produto?: string | null; cor?: string | null }[] }).data ?? []
          : [];
      const produto_cor_fb = new Set(
        produtoCorData.map((r) => `${String(r.nome_produto ?? "").trim()}::${String(r.cor ?? "").trim()}`)
      ).size;

      agg = {
        saldo_sellers_total: saldo_fb,
        estoque_baixo: estoque_baixo_fb,
        entrada_mes: entrada_fb,
        mensalidades_sellers_pendente: mensalSellersData.reduce((s, r) => s + Number(r.valor || 0), 0),
        mensalidades_fornecedores_pendente: mensalFornData.reduce((s, r) => s + Number(r.valor || 0), 0),
        produto_cor_count: produto_cor_fb,
        min_vencimento_pendente: null,
      };
    }

    const [
      fornAll,
      fornAtivos,
      skusAll,
      skusAtivos,
      sellersAtivosRes,
      pixPendentes,
      repassesPendentes,
      pedidosHojeRes,
      pedidosAguardandoRes,
      vendasMesRes,
      alteracoesPendentesRes,
    ] = countsSettled;

    const fornecedores_total = fornAll.status === "fulfilled" ? (fornAll.value as { count?: number }).count ?? 0 : 0;
    const fornecedores_ativos = fornAtivos.status === "fulfilled" ? (fornAtivos.value as { count?: number }).count ?? 0 : 0;
    const skus_total = skusAll.status === "fulfilled" ? (skusAll.value as { count?: number }).count ?? 0 : 0;
    const skus_ativos = skusAtivos.status === "fulfilled" ? (skusAtivos.value as { count?: number }).count ?? 0 : 0;
    const estoque_baixo = agg.estoque_baixo;
    const sellers_ativos = sellersAtivosRes.status === "fulfilled" ? (sellersAtivosRes.value as { count?: number }).count ?? 0 : 0;
    const saldo_sellers_total = agg.saldo_sellers_total;

    const depositos_pix_pendentes =
      pixPendentes.status === "fulfilled" ? (pixPendentes.value as { count?: number }).count ?? 0 : 0;

    const repasses_pendentes =
      repassesPendentes.status === "fulfilled" ? (repassesPendentes.value as { count?: number }).count ?? 0 : 0;

    const entrada_mes = agg.entrada_mes;

    let receita_dropcore = rpcAgg?.receita_dropcore_total;
    if (receita_dropcore == null) {
      const { data: ciclosData } = await supabase
        .from("financial_ciclos_repasse")
        .select("total_dropcore")
        .eq("org_id", org_id)
        .eq("status", "fechado");
      receita_dropcore = (ciclosData ?? []).reduce((s, r) => s + Number(r.total_dropcore || 0), 0);
    }

    const pedidos_hoje =
      pedidosHojeRes.status === "fulfilled" && !(pedidosHojeRes.value as { error?: unknown }).error
        ? ((pedidosHojeRes.value as { count?: number }).count ?? 0)
        : 0;

    const mensalidades_sellers_pendente = agg.mensalidades_sellers_pendente;
    const mensalidades_fornecedores_pendente = agg.mensalidades_fornecedores_pendente;

    const inadimplentes_sellers = mensalidade_portal.sellers.inadimplentes;
    const inadimplentes_fornecedores = mensalidade_portal.fornecedores.inadimplentes;

    let dias_ate_vencimento = diasAteVencimentoFromMin(agg.min_vencimento_pendente);
    if (dias_ate_vencimento === null && !rpcAgg) {
      const { data: mensalVencRows } = await supabase
        .from("financial_mensalidades")
        .select("vencimento_em")
        .eq("org_id", org_id)
        .eq("status", "pendente")
        .not("vencimento_em", "is", null);
      for (const m of mensalVencRows ?? []) {
        if (!m.vencimento_em || typeof m.vencimento_em !== "string") continue;
        const d = diasAteVencimentoFromMin(m.vencimento_em);
        if (d === null) continue;
        if (dias_ate_vencimento === null || d < dias_ate_vencimento) dias_ate_vencimento = d;
      }
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaAtual = hoje.getDate();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diasRestantesMes = ultimoDia - diaAtual;

    const pedidos_aguardando_envio =
      pedidosAguardandoRes.status === "fulfilled" ? (pedidosAguardandoRes.value as { count?: number }).count ?? 0 : 0;

    const alteracoes_pendentes =
      alteracoesPendentesRes?.status === "fulfilled" ? ((alteracoesPendentesRes.value as { count?: number }).count ?? 0) : 0;

    const vendas_mes =
      vendasMesRes.status === "fulfilled" ? (vendasMesRes.value as { count?: number }).count ?? 0 : 0;

    const produto_cor_count = agg.produto_cor_count;

    const isStarter = String(plano ?? "").toLowerCase() !== "pro";

    const cicloRepasseRow = cicloRepasseRowRes.data;

    let repasse_ledger_pronto_proximo_ciclo = 0;
    if (cicloRepasseRow?.status !== "fechado") {
      const { count } = await supabase
        .from("financial_ledger")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org_id)
        .eq("ciclo_repasse", repasse_proximo_ciclo)
        .in("tipo", ["BLOQUEIO", "VENDA"])
        .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"]);
      repasse_ledger_pronto_proximo_ciclo = count ?? 0;
    }

    const {
      repasse_futuros_previstos_total_valor,
      repasse_futuros_previstos_total_pedidos,
      repasse_futuros_previstos_ciclos_qtd,
      repasse_futuros_proximo_ciclo,
      repasse_futuros_proximo_pedidos,
      repasse_futuros_proximo_valor,
    } = repassePreviewRes;

    return NextResponse.json({
      fornecedores_total,
      fornecedores_ativos,
      skus_total,
      skus_ativos,
      estoque_baixo,
      sellers_ativos,
      pedidos_hoje,
      repasses_pendentes,
      repasse_ledger_pronto_proximo_ciclo,
      repasse_proximo_ciclo,
      repasse_futuros_previstos_total_valor,
      repasse_futuros_previstos_total_pedidos,
      repasse_futuros_previstos_ciclos_qtd,
      repasse_futuros_proximo_ciclo,
      repasse_futuros_proximo_pedidos,
      repasse_futuros_proximo_valor,
      saldo_sellers_total,
      depositos_pix_pendentes,
      entrada_mes,
      receita_dropcore,
      mensalidades_sellers_pendente,
      mensalidades_fornecedores_pendente,
      inadimplentes_sellers,
      inadimplentes_fornecedores,
      mensalidade_portal,
      portal_trial_days: portalTrialDays(),
      pedidos_aguardando_envio,
      alteracoes_pendentes,
      plano,
      lembrete_mensalidade: {
        dias_ate_vencimento: dias_ate_vencimento,
        fim_mes_proximo: diasRestantesMes <= 7,
      },
      ...(isStarter && {
        plan_limits: {
          vendas_mes,
          vendas_limite: 200,
          produto_cor_count,
          produto_cor_limite: 15,
        },
      }),
    });
  } catch (e: unknown) {
    if (e instanceof OrgAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" ||
      msg === "Usuário sem organização." ||
      msg === "Token inválido ou expirado." ||
      msg === "Sem token (Authorization)."
        ? 401
        : msg === "Sem permissão."
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
