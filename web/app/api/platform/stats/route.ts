/**
 * GET /api/platform/stats
 * Dados de toda a plataforma DropCore — visível SOMENTE para owner.
 * Sellers = clientes da DropCore (têm plano Starter ou Pro)
 * Fornecedores = parceiros que enviam produtos
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwner } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireOwner(req);

    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const fimMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString();
    const inicio30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      sellersRes,
      fornecedoresRes,
      skusRes,
      pedidosMesRes,
      pedidosMesAnteriorRes,
      mensalidadesMesRes,
      mensalidadesPendentesRes,
      receitaDropcoreTotalRes,
      receitaDropcoreMesRes,
      pixPendentesRes,
      pedidosAguardandoRes,
    ] = await Promise.allSettled([
      // Todos os sellers (para calcular Pro vs Starter e novos)
      supabaseAdmin.from("sellers").select("id, nome, plano, status, criado_em"),
      // Todos os fornecedores
      supabaseAdmin.from("fornecedores").select("id, nome, status, criado_em"),
      // Total de SKUs ativos
      supabaseAdmin.from("skus").select("id", { count: "exact", head: true }).ilike("status", "ativo"),
      // Pedidos criados este mês
      supabaseAdmin.from("pedidos").select("id, valor_total, valor_dropcore").gte("criado_em", inicioMes).lte("criado_em", fimMes),
      // Pedidos criados mês anterior
      supabaseAdmin.from("pedidos").select("id", { count: "exact", head: true }).gte("criado_em", inicioMesAnterior).lte("criado_em", fimMesAnterior),
      // Mensalidades pagas este mês (MRR realizado)
      supabaseAdmin.from("financial_mensalidades").select("valor, tipo").eq("status", "pago").gte("pago_em", inicioMes).lte("pago_em", fimMes),
      // Mensalidades pendentes (MRR a receber)
      supabaseAdmin.from("financial_mensalidades").select("valor, tipo").eq("status", "pendente"),
      // Receita DropCore total (todos os ciclos fechados)
      supabaseAdmin.from("financial_ciclos_repasse").select("total_dropcore").eq("status", "fechado"),
      // Receita DropCore este mês
      supabaseAdmin.from("financial_ciclos_repasse").select("total_dropcore").eq("status", "fechado").gte("fechado_em", inicioMes).lte("fechado_em", fimMes),
      // PIX pendentes em toda a plataforma
      supabaseAdmin.from("seller_depositos_pix").select("id, valor").eq("status", "pendente"),
      // Pedidos aguardando confirmação de envio
      supabaseAdmin.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "enviado"),
    ]);

    // ── Sellers ──────────────────────────────────────────────────────────────
    type SellerRow = { id: string; nome?: string; plano?: string; status?: string; criado_em?: string };
    const sellers = sellersRes.status === "fulfilled" ? (sellersRes.value.data ?? []) as SellerRow[] : [];
    const sellers_total = sellers.length;
    const sellers_ativos = sellers.filter(s => s.status?.toLowerCase() === "ativo").length;
    const sellers_pro = sellers.filter(s => s.plano?.toLowerCase() === "pro").length;
    const sellers_starter = sellers.filter(s => s.plano?.toLowerCase() !== "pro").length;
    const sellers_novos_30d = sellers.filter(s => s.criado_em && s.criado_em >= inicio30d).length;
    const sellers_lista = sellers
      .sort((a, b) => (b.criado_em ?? "") > (a.criado_em ?? "") ? 1 : -1)
      .map(s => ({
        id: s.id,
        nome: s.nome ?? "—",
        plano: s.plano ?? "starter",
        status: s.status ?? "ativo",
        criado_em: s.criado_em ?? "",
      }));

    // ── Fornecedores / SKUs ───────────────────────────────────────────────────
    type FornecedorRow = { id: string; nome?: string; status?: string; criado_em?: string };
    const fornecedores = fornecedoresRes.status === "fulfilled" ? (fornecedoresRes.value.data ?? []) as FornecedorRow[] : [];
    const fornecedores_ativos = fornecedores.filter(f => f.status?.toLowerCase() === "ativo").length;
    const fornecedores_lista = fornecedores
      .sort((a, b) => (b.criado_em ?? "") > (a.criado_em ?? "") ? 1 : -1)
      .map(f => ({ id: f.id, nome: f.nome ?? "—", status: f.status ?? "ativo", criado_em: f.criado_em ?? "" }));
    const skus_ativos = skusRes.status === "fulfilled" ? (skusRes.value.count ?? 0) : 0;

    // ── Pedidos ───────────────────────────────────────────────────────────────
    type PedidoRow = { valor_total?: number; valor_dropcore?: number };
    const pedidosMes = pedidosMesRes.status === "fulfilled" ? (pedidosMesRes.value.data ?? []) as PedidoRow[] : [];
    const pedidos_mes = pedidosMes.length;
    const volume_mes = pedidosMes.reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
    const receita_dropcore_mes_pedidos = pedidosMes.reduce((s, p) => s + Number(p.valor_dropcore ?? 0), 0);
    const pedidos_mes_anterior = pedidosMesAnteriorRes.status === "fulfilled" ? (pedidosMesAnteriorRes.value.count ?? 0) : 0;
    const pedidos_crescimento_pct = pedidos_mes_anterior > 0
      ? ((pedidos_mes - pedidos_mes_anterior) / pedidos_mes_anterior) * 100
      : null;

    // ── MRR ───────────────────────────────────────────────────────────────────
    type MensalidadeRow = { valor?: number; tipo?: string };
    const mensalidadesMes = mensalidadesMesRes.status === "fulfilled" ? (mensalidadesMesRes.value.data ?? []) as MensalidadeRow[] : [];
    const mrr_realizado = mensalidadesMes.reduce((s, m) => s + Number(m.valor ?? 0), 0);
    const mensalidadesPendentes = mensalidadesPendentesRes.status === "fulfilled" ? (mensalidadesPendentesRes.value.data ?? []) as MensalidadeRow[] : [];
    const mrr_pendente = mensalidadesPendentes
      .filter(m => m.tipo === "seller")
      .reduce((s, m) => s + Number(m.valor ?? 0), 0);

    // ── Receita DropCore ──────────────────────────────────────────────────────
    type CicloRow = { total_dropcore?: number };
    const ciclosTodos = receitaDropcoreTotalRes.status === "fulfilled" ? (receitaDropcoreTotalRes.value.data ?? []) as CicloRow[] : [];
    const receita_dropcore_total = ciclosTodos.reduce((s, c) => s + Number(c.total_dropcore ?? 0), 0);
    const ciclosMes = receitaDropcoreMesRes.status === "fulfilled" ? (receitaDropcoreMesRes.value.data ?? []) as CicloRow[] : [];
    const receita_dropcore_mes = ciclosMes.reduce((s, c) => s + Number(c.total_dropcore ?? 0), 0);

    // ── PIX / Pedidos urgentes ────────────────────────────────────────────────
    type PixRow = { valor?: number };
    const pixPendentes = pixPendentesRes.status === "fulfilled" ? (pixPendentesRes.value.data ?? []) as PixRow[] : [];
    const pix_pendentes_count = pixPendentes.length;
    const pix_pendentes_valor = pixPendentes.reduce((s, p) => s + Number(p.valor ?? 0), 0);
    const pedidos_aguardando_envio = pedidosAguardandoRes.status === "fulfilled" ? (pedidosAguardandoRes.value.count ?? 0) : 0;

    return NextResponse.json({
      // Sellers
      sellers_total,
      sellers_ativos,
      sellers_pro,
      sellers_starter,
      sellers_novos_30d,
      sellers_lista,
      // Fornecedores / SKUs
      fornecedores_ativos,
      fornecedores_lista,
      skus_ativos,
      // Pedidos
      pedidos_mes,
      pedidos_mes_anterior,
      pedidos_crescimento_pct,
      volume_mes,
      receita_dropcore_mes_pedidos,
      // MRR
      mrr_realizado,
      mrr_pendente,
      // Receita
      receita_dropcore_total,
      receita_dropcore_mes,
      // Urgentes
      pix_pendentes_count,
      pix_pendentes_valor,
      pedidos_aguardando_envio,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
