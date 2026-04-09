import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { marcarInadimplentes, contarInadimplentes } from "@/lib/inadimplencia";
import { resumoMensalidadePortal } from "@/lib/mensalidadeResumoPortal";
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

    const { data: org } = await supabase.from("orgs").select("plano").eq("id", org_id).maybeSingle();
    const plano = org?.plano ?? "starter";

    // Marca mensalidades vencidas como inadimplente (roda a cada load do dashboard)
    await marcarInadimplentes(supabase, org_id);

    const now = new Date();
    const primeiroDiaMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const ultimoDiaMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const hojeInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const hojeFim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    const [fornAll, fornAtivos, skusAll, skusAtivos, skusBaixo, sellersAtivosRes, sellersSaldos, pixPendentes, repassesPendentes, entradaMesRes, ciclosRepasse, pedidosHojeRes, mensalSellersRes, mensalFornRes, pedidosAguardandoRes, mensalPendentesComVenc, vendasMesRes, produtoCorRes, alteracoesPendentesRes] = await Promise.allSettled([
      supabase.from("fornecedores").select("id", { count: "exact", head: true }).eq("org_id", org_id),
      supabase.from("fornecedores").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo"),
      supabase.from("skus").select("id", { count: "exact", head: true }).eq("org_id", org_id).not("sku", "ilike", `${PREFIXO_OCULTO}%`),
      supabase.from("skus").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo").not("sku", "ilike", `${PREFIXO_OCULTO}%`),
      supabase.from("skus").select("id, estoque_atual, estoque_minimo").eq("org_id", org_id).not("sku", "ilike", `${PREFIXO_OCULTO}%`).limit(2000),
      supabase.from("sellers").select("id", { count: "exact", head: true }).eq("org_id", org_id).ilike("status", "ativo"),
      supabase.from("sellers").select("saldo_atual").eq("org_id", org_id),
      supabase.from("seller_depositos_pix").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
      supabase.from("financial_repasse_fornecedor").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
      supabase
        .from("seller_depositos_pix")
        .select("valor")
        .eq("org_id", org_id)
        .eq("status", "aprovado")
        .not("aprovado_em", "is", null)
        .gte("aprovado_em", primeiroDiaMes)
        .lte("aprovado_em", ultimoDiaMes),
      supabase.from("financial_ciclos_repasse").select("total_dropcore").eq("org_id", org_id).eq("status", "fechado"),
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org_id)
        .gte("criado_em", hojeInicio)
        .lte("criado_em", hojeFim),
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
        .from("financial_mensalidades")
        .select("id, vencimento_em, ciclo")
        .eq("org_id", org_id)
        .eq("status", "pendente")
        .not("vencimento_em", "is", null),
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
      supabase
        .from("skus")
        .select("nome_produto, cor")
        .eq("org_id", org_id)
        .ilike("status", "ativo")
        .not("sku", "ilike", `${PREFIXO_OCULTO}%`),
      supabase.from("sku_alteracoes_pendentes").select("id", { count: "exact", head: true }).eq("org_id", org_id).eq("status", "pendente"),
    ]);

    const fornecedores_total = fornAll.status === "fulfilled" ? (fornAll.value as { count?: number }).count ?? 0 : 0;
    const fornecedores_ativos = fornAtivos.status === "fulfilled" ? (fornAtivos.value as { count?: number }).count ?? 0 : 0;
    const skus_total = skusAll.status === "fulfilled" ? (skusAll.value as { count?: number }).count ?? 0 : 0;
    const skus_ativos = skusAtivos.status === "fulfilled" ? (skusAtivos.value as { count?: number }).count ?? 0 : 0;
    const skusBaixoData = skusBaixo.status === "fulfilled" ? (skusBaixo.value as { data?: unknown[] }).data ?? [] : [];

    const estoque_baixo = (skusBaixoData as { estoque_atual?: number | null; estoque_minimo?: number | null }[]).filter(
      (r) => {
        const min = r.estoque_minimo;
        const atual = r.estoque_atual;
        return min != null && atual != null && Number(atual) < Number(min);
      }
    ).length;

    const sellers_ativos = sellersAtivosRes.status === "fulfilled" ? (sellersAtivosRes.value as { count?: number }).count ?? 0 : 0;

    const saldo_sellers_total =
      sellersSaldos.status === "fulfilled" && Array.isArray((sellersSaldos.value as { data?: { saldo_atual: number }[] }).data)
        ? ((sellersSaldos.value as { data: { saldo_atual: number }[] }).data || []).reduce((s, r) => s + Number(r.saldo_atual || 0), 0)
        : 0;

    const depositos_pix_pendentes =
      pixPendentes.status === "fulfilled" ? (pixPendentes.value as { count?: number }).count ?? 0 : 0;

    const repasses_pendentes =
      repassesPendentes.status === "fulfilled" ? (repassesPendentes.value as { count?: number }).count ?? 0 : 0;

    const entradaMesData = entradaMesRes.status === "fulfilled" && Array.isArray((entradaMesRes.value as { data?: { valor: number }[] }).data)
      ? (entradaMesRes.value as { data: { valor: number }[] }).data || []
      : [];
    const entrada_mes = entradaMesData.reduce((s, r) => s + Number(r.valor || 0), 0);

    const ciclosData = ciclosRepasse.status === "fulfilled" && Array.isArray((ciclosRepasse.value as { data?: { total_dropcore: number }[] }).data)
      ? (ciclosRepasse.value as { data: { total_dropcore: number }[] }).data ?? []
      : [];
    const receita_dropcore = (ciclosData as { total_dropcore?: number }[]).reduce((s, r) => s + Number(r.total_dropcore || 0), 0);

    const pedidos_hoje =
      pedidosHojeRes.status === "fulfilled" && !(pedidosHojeRes.value as { error?: unknown }).error
        ? ((pedidosHojeRes.value as { count?: number }).count ?? 0)
        : 0;

    const mensalSellersData =
      mensalSellersRes.status === "fulfilled" && Array.isArray((mensalSellersRes.value as { data?: { valor: number }[] }).data)
        ? (mensalSellersRes.value as { data: { valor: number }[] }).data ?? []
        : [];
    const mensalFornData =
      mensalFornRes.status === "fulfilled" && Array.isArray((mensalFornRes.value as { data?: { valor: number }[] }).data)
        ? (mensalFornRes.value as { data: { valor: number }[] }).data ?? []
        : [];

    const mensalidades_sellers_pendente = mensalSellersData.reduce((s, r) => s + Number(r.valor || 0), 0);
    const mensalidades_fornecedores_pendente = mensalFornData.reduce((s, r) => s + Number(r.valor || 0), 0);

    const inadimplentes = await contarInadimplentes(supabase, org_id);
    const mensalidade_portal = await resumoMensalidadePortal(supabase, org_id);

    // Notificação para admins quando há inadimplentes (deduplicação 24h)
    const totalInadimplentes = inadimplentes.sellers + inadimplentes.fornecedores;
    if (totalInadimplentes > 0) {
      const desde = new Date();
      desde.setHours(desde.getHours() - 24);
      const { data: admins } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", org_id)
        .in("role_base", ["owner", "admin"]);
      const msg =
        inadimplentes.sellers > 0 && inadimplentes.fornecedores > 0
          ? `${inadimplentes.sellers} seller(s) e ${inadimplentes.fornecedores} fornecedor(es) inadimplentes. Verifique as mensalidades.`
          : inadimplentes.sellers > 0
            ? `${inadimplentes.sellers} seller(s) inadimplente(s). Verifique as mensalidades.`
            : `${inadimplentes.fornecedores} fornecedor(es) inadimplente(s). Verifique as mensalidades.`;
      for (const a of admins ?? []) {
        if (!a.user_id) continue;
        const { data: jaExiste } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", a.user_id)
          .eq("tipo", "mensalidade_vencida")
          .gte("criado_em", desde.toISOString())
          .limit(1)
          .maybeSingle();
        if (!jaExiste) {
          await supabase.from("notifications").insert({
            user_id: a.user_id,
            tipo: "mensalidade_vencida",
            titulo: "Mensalidades vencidas",
            mensagem: msg,
            metadata: {},
          });
        }
      }
    }

    const mensalPendentesData: Array<{ vencimento_em: string }> =
      mensalPendentesComVenc.status === "fulfilled"
        ? (((mensalPendentesComVenc.value as unknown as { data?: Array<{ vencimento_em: string }> })?.data ?? []).filter(
            (m): m is { vencimento_em: string } => !!m && typeof m.vencimento_em === "string"
          ))
        : [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let dias_ate_vencimento: number | null = null;
    for (const m of mensalPendentesData) {
      const v = new Date(m.vencimento_em + "T12:00:00");
      const diff = Math.ceil((v.getTime() - hoje.getTime()) / 864e5);
      if (dias_ate_vencimento === null || diff < dias_ate_vencimento) dias_ate_vencimento = diff;
    }
    const diaAtual = hoje.getDate();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const diasRestantesMes = ultimoDia - diaAtual;

    const pedidos_aguardando_envio =
      pedidosAguardandoRes.status === "fulfilled" ? (pedidosAguardandoRes.value as { count?: number }).count ?? 0 : 0;

    const alteracoes_pendentes =
      alteracoesPendentesRes?.status === "fulfilled" ? ((alteracoesPendentesRes.value as { count?: number }).count ?? 0) : 0;

    const vendas_mes =
      vendasMesRes.status === "fulfilled" ? (vendasMesRes.value as { count?: number }).count ?? 0 : 0;

    const produtoCorData =
      produtoCorRes.status === "fulfilled" && Array.isArray((produtoCorRes.value as { data?: { nome_produto?: string | null; cor?: string | null }[] }).data)
        ? (produtoCorRes.value as { data: { nome_produto?: string | null; cor?: string | null }[] }).data ?? []
        : [];
    const produto_cor_count = new Set(
      produtoCorData.map((r) => `${String(r.nome_produto ?? "").trim()}::${String(r.cor ?? "").trim()}`)
    ).size;

    const isStarter = String(plano ?? "").toLowerCase() !== "pro";

    const repasse_proximo_ciclo = proximaSegundaFeira();
    const { data: cicloRepasseRow } = await supabase
      .from("financial_ciclos_repasse")
      .select("status")
      .eq("org_id", org_id)
      .eq("ciclo_repasse", repasse_proximo_ciclo)
      .maybeSingle();

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

    // Preview de repasses futuros (baseado no ledger), similar ao que o fornecedor faz.
    // - Considera qualquer ciclo >= hoje
    // - Agrupa por `ciclo_repasse` e soma `valor_fornecedor`
    // - Usa `ENTREGUE`/`AGUARDANDO_REPASSE` como status "pronto no ledger"
    const hojePreview = new Date();
    hojePreview.setHours(0, 0, 0, 0);
    const hojeStr = hojePreview.toISOString().slice(0, 10);

    const { data: prevRows, error: prevErr } = await supabase
      .from("financial_ledger")
      .select("ciclo_repasse, valor_fornecedor")
      .eq("org_id", org_id)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"])
      .gte("ciclo_repasse", hojeStr)
      .order("ciclo_repasse", { ascending: true })
      .limit(2000);

    if (prevErr) throw prevErr;

    const byCycle: Record<string, { valor: number; pedidos: number }> = {};
    for (const r of prevRows ?? []) {
      const ciclo = (r as any).ciclo_repasse as string | null;
      if (!ciclo) continue;
      if (!byCycle[ciclo]) byCycle[ciclo] = { valor: 0, pedidos: 0 };
      byCycle[ciclo].valor += Number((r as any).valor_fornecedor ?? 0);
      byCycle[ciclo].pedidos += 1;
    }

    const repasse_futuros_previstos = Object.keys(byCycle)
      .sort((a, b) => (a < b ? -1 : 1))
      .map((ciclo) => ({
        ciclo_repasse: ciclo,
        valor_previsto: Math.max(0, byCycle[ciclo].valor),
        pedidos: byCycle[ciclo].pedidos,
      }))
      .filter((x) => x.valor_previsto > 0);

    const repasse_futuros_previstos_top8 = repasse_futuros_previstos.slice(0, 8);
    const repasse_futuros_previstos_total_valor = repasse_futuros_previstos_top8.reduce((s, x) => s + Number(x.valor_previsto ?? 0), 0);
    const repasse_futuros_previstos_total_pedidos = repasse_futuros_previstos_top8.reduce((s, x) => s + Number(x.pedidos ?? 0), 0);
    const proximo_futuro = repasse_futuros_previstos_top8[0] ?? null;

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
      repasse_futuros_previstos_ciclos_qtd: repasse_futuros_previstos_top8.length,
      repasse_futuros_proximo_ciclo: proximo_futuro?.ciclo_repasse ?? null,
      repasse_futuros_proximo_pedidos: proximo_futuro?.pedidos ?? 0,
      repasse_futuros_proximo_valor: proximo_futuro?.valor_previsto ?? 0,
      saldo_sellers_total,
      depositos_pix_pendentes,
      entrada_mes,
      receita_dropcore,
      mensalidades_sellers_pendente,
      mensalidades_fornecedores_pendente,
      inadimplentes_sellers: inadimplentes.sellers,
      inadimplentes_fornecedores: inadimplentes.fornecedores,
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
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
