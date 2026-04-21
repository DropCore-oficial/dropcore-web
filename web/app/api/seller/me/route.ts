/**
 * GET /api/seller/me
 * Retorna dados do seller autenticado: saldo, plano, org, extrato recente.
 * Requer Bearer token do seller (Supabase Auth).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import { isPortalTrialAtivo } from "@/lib/portalTrial";
import { MESES_MINIMOS_COM_FORNECEDOR, dataMinimaTrocaFornecedor, podeTrocarFornecedorAgora } from "@/lib/sellerFornecedorVinculo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    // Valida o token e obtém o user
    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const user_id = userData.user.id;

    // Busca o seller vinculado a esse user_id
    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, nome, documento, plano, status, saldo_atual, saldo_bloqueado, data_entrada, email, telefone")
      .eq("user_id", user_id)
      .maybeSingle();

    if (sellerErr || !seller) {
      return NextResponse.json({ error: "Seller não encontrado para este usuário." }, { status: 404 });
    }

    if (seller.status === "bloqueado") {
      return NextResponse.json({ error: "Conta bloqueada. Entre em contato com o suporte." }, { status: 403 });
    }

    let fornecedor_id: string | null = null;
    let fornecedor_nome: string | null = null;
    let fornecedor_vinculado_em: string | null = null;
    let fornecedor_desvinculo_liberado = false;
    {
      const rFull = await supabaseAdmin
        .from("sellers")
        .select("fornecedor_id, fornecedor_vinculado_em, fornecedor_desvinculo_liberado")
        .eq("id", seller.id)
        .maybeSingle();
      if (rFull.error && (rFull.error.message?.includes("column") || rFull.error.code === "42703")) {
        const r2 = await supabaseAdmin.from("sellers").select("fornecedor_id").eq("id", seller.id).maybeSingle();
        fornecedor_id = (r2.data as { fornecedor_id?: string | null } | null)?.fornecedor_id ?? null;
      } else {
        const s2 = rFull.data as {
          fornecedor_id?: string | null;
          fornecedor_vinculado_em?: string | null;
          fornecedor_desvinculo_liberado?: boolean | null;
        } | null;
        fornecedor_id = s2?.fornecedor_id ?? null;
        fornecedor_vinculado_em = s2?.fornecedor_vinculado_em ?? null;
        fornecedor_desvinculo_liberado = Boolean(s2?.fornecedor_desvinculo_liberado);
      }
      if (fornecedor_id) {
        const { data: forn } = await supabaseAdmin.from("fornecedores").select("nome").eq("id", fornecedor_id).maybeSingle();
        fornecedor_nome = forn?.nome ?? null;
      }
    }

    const podeTrocarArmazem = !fornecedor_id || podeTrocarFornecedorAgora(fornecedor_vinculado_em, fornecedor_desvinculo_liberado, false);
    const dataMinTroca = dataMinimaTrocaFornecedor(fornecedor_vinculado_em);
    const vinculo_fornecedor = {
      ativo: Boolean(fornecedor_id),
      vinculado_em: fornecedor_vinculado_em,
      pode_trocar_a_partir_de: dataMinTroca?.toISOString() ?? null,
      meses_minimos: MESES_MINIMOS_COM_FORNECEDOR,
      dentro_compromisso: Boolean(fornecedor_id) && !podeTrocarArmazem,
      liberado_antecipado: fornecedor_desvinculo_liberado,
    };

    // Extrato recente (últimas 200 movimentações do ledger — necessário para gráfico de 120 dias)
    const { data: extrato } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, tipo, fornecedor_id, valor_total, status, data_evento, referencia, pedido_id")
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .order("data_evento", { ascending: false })
      .limit(200);

    // Enriquecer extrato com nome do fornecedor
    const fornIds = [...new Set((extrato ?? []).map((e) => e.fornecedor_id).filter(Boolean))] as string[];
    let fornNomes: Record<string, string> = {};
    if (fornIds.length > 0) {
      const { data: forns } = await supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornIds);
      for (const f of forns ?? []) fornNomes[f.id] = f.nome;
    }

    // Buscar nome_produto dos pedidos vinculados ao extrato
    const pedidoIds = [...new Set((extrato ?? []).map((e) => e.pedido_id).filter(Boolean))] as string[];
    let pedidoNomes: Record<string, string> = {};
    let pedidoDetalhes: Record<string, { preco_venda: number | null; custo: number }> = {};
    let pedidoStatusById: Record<string, string> = {};
    if (pedidoIds.length > 0) {
      const { data: pedidosData } = await supabaseAdmin
        .from("pedidos")
        .select("id, nome_produto, preco_venda, valor_fornecedor, valor_dropcore, valor_total, status")
        .in("id", pedidoIds);
      type PedidoRow = {
        id: string;
        nome_produto: string | null;
        preco_venda: number | null;
        valor_fornecedor: number;
        valor_dropcore: number;
        valor_total: number;
        status: string;
      };
      for (const p of (pedidosData ?? []) as PedidoRow[]) {
        if (p.nome_produto) pedidoNomes[p.id] = p.nome_produto;
        pedidoDetalhes[p.id] = {
          preco_venda: p.preco_venda ? Number(p.preco_venda) : null,
          custo: Number(p.valor_total),
        };
        pedidoStatusById[p.id] = p.status;
      }
    }

    /** Se o ledger ficou BLOQUEADO mas o pedido já avançou, o extrato acompanha o pedido (evita dessincronia). */
    function statusExtratoAlinhadoPedido(
      tipo: string,
      ledgerStatus: string,
      pedidoId: string | null
    ): string {
      if (!pedidoId || (tipo !== "BLOQUEIO" && tipo !== "VENDA")) return ledgerStatus;
      if (ledgerStatus !== "BLOQUEADO") return ledgerStatus;
      const ps = pedidoStatusById[pedidoId];
      if (!ps) return ledgerStatus;
      if (ps === "aguardando_repasse") return "AGUARDANDO_REPASSE";
      if (ps === "entregue") return "ENTREGUE";
      if (ps === "devolvido") return "DEVOLVIDO";
      if (ps === "cancelado") return "CANCELADO";
      return ledgerStatus;
    }

    const extratoEnriquecido = (extrato ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      valor_total: Number(e.valor_total),
      status: statusExtratoAlinhadoPedido(e.tipo, e.status, e.pedido_id ?? null),
      data_evento: e.data_evento,
      referencia: e.referencia,
      pedido_id: e.pedido_id,
      nome_produto: e.pedido_id ? (pedidoNomes[e.pedido_id] ?? null) : null,
      preco_venda: e.pedido_id ? (pedidoDetalhes[e.pedido_id]?.preco_venda ?? null) : null,
      custo: e.pedido_id ? (pedidoDetalhes[e.pedido_id]?.custo ?? null) : null,
      fornecedor_nome: e.fornecedor_id ? (fornNomes[e.fornecedor_id] ?? "—") : null,
    }));

    const saldoDisponivel = Math.max(0, Number(seller.saldo_atual ?? 0) - Number(seller.saldo_bloqueado ?? 0));

    /** Custo médio por pedido (BLOQUEIO/VENDA) para estimar quantos pedidos o saldo ainda cobre. */
    function custoMedioPedidosRecentes(dias: number): { media: number | null; amostra: number } {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dias);
      cutoff.setHours(0, 0, 0, 0);
      const cutoffIso = cutoff.toISOString();
      const linhas = extratoEnriquecido.filter(
        (e) =>
          (e.tipo === "BLOQUEIO" || e.tipo === "VENDA") &&
          String(e.status).toUpperCase() !== "CANCELADO" &&
          typeof e.data_evento === "string" &&
          e.data_evento >= cutoffIso
      );
      if (linhas.length === 0) return { media: null, amostra: 0 };
      const soma = linhas.reduce((s, e) => s + (Number.isFinite(e.valor_total) ? e.valor_total : 0), 0);
      return { media: soma / linhas.length, amostra: linhas.length };
    }

    let { media: custoMedioPedido, amostra: amostraPedidos } = custoMedioPedidosRecentes(30);
    if (custoMedioPedido == null || amostraPedidos === 0) {
      const fallback = extratoEnriquecido.filter(
        (e) =>
          (e.tipo === "BLOQUEIO" || e.tipo === "VENDA") && String(e.status).toUpperCase() !== "CANCELADO"
      );
      if (fallback.length > 0) {
        const soma = fallback.reduce((s, e) => s + (Number.isFinite(e.valor_total) ? e.valor_total : 0), 0);
        custoMedioPedido = soma / fallback.length;
        amostraPedidos = fallback.length;
      }
    }

    const pedidosEstimados =
      custoMedioPedido != null && custoMedioPedido > 0 ? Math.floor(saldoDisponivel / custoMedioPedido) : null;

    let saldo_alerta_nivel: "ok" | "atencao" | "critico" = "ok";
    if (pedidosEstimados != null) {
      if (pedidosEstimados < 2 || saldoDisponivel <= 0) saldo_alerta_nivel = "critico";
      else if (pedidosEstimados < 8) saldo_alerta_nivel = "atencao";
    } else {
      if (saldoDisponivel < 100) saldo_alerta_nivel = "critico";
      else if (saldoDisponivel < 400) saldo_alerta_nivel = "atencao";
    }

    const saldo_alerta = {
      nivel: saldo_alerta_nivel,
      saldo_disponivel: saldoDisponivel,
      custo_medio_pedido: custoMedioPedido != null && custoMedioPedido > 0 ? Math.round(custoMedioPedido * 100) / 100 : null,
      amostra_pedidos: amostraPedidos,
      pedidos_estimados: pedidosEstimados,
    };

    // KPIs do mês atual
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const pedidosMes = extratoEnriquecido.filter(
      (e) => (e.tipo === "BLOQUEIO" || e.tipo === "VENDA") && e.data_evento >= inicioMes && e.status !== "CANCELADO"
    );
    const totalMes = pedidosMes.reduce((s, e) => s + e.valor_total, 0);

    if (saldo_alerta_nivel === "critico") {
      const desde = new Date();
      desde.setHours(desde.getHours() - 24);
      const { data: jaExiste } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", user_id)
        .eq("tipo", "saldo_baixo")
        .gte("criado_em", desde.toISOString())
        .limit(1)
        .maybeSingle();
      if (!jaExiste) {
        const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
        const mensagemCritico =
          pedidosEstimados != null && custoMedioPedido != null && custoMedioPedido > 0
            ? `Saldo disponível ${fmt.format(saldoDisponivel)} cobre cerca de ${pedidosEstimados} pedido(s) (média ${fmt.format(custoMedioPedido)}). Deposite via PIX para não travar vendas.`
            : `Saldo disponível ${fmt.format(saldoDisponivel)}. Faça um depósito PIX para continuar vendendo.`;
        await supabaseAdmin.from("notifications").insert({
          user_id,
          tipo: "saldo_baixo",
          titulo: "Saldo crítico para pedidos",
          mensagem: mensagemCritico,
          metadata: { pedidos_estimados: pedidosEstimados },
        });
      }
    }

    // Depósitos PIX recentes
    const { data: depositos } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id, valor, status, criado_em, aprovado_em")
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .order("criado_em", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      seller: {
        id: seller.id,
        org_id: seller.org_id,
        nome: seller.nome,
        documento: seller.documento ? String(seller.documento).replace(/\d(?=\d{4})/g, "*") : null,
        plano: seller.plano,
        status: seller.status,
        saldo_atual: Number(seller.saldo_atual ?? 0),
        saldo_bloqueado: Number(seller.saldo_bloqueado ?? 0),
        saldo_disponivel: saldoDisponivel,
        data_entrada: seller.data_entrada,
        email: seller.email,
        telefone: seller.telefone,
        fornecedor_id,
        fornecedor_nome,
        trial_valido_ate: (seller as { trial_valido_ate?: string | null }).trial_valido_ate ?? null,
        trial_ativo: isPortalTrialAtivo((seller as { trial_valido_ate?: string | null }).trial_valido_ate),
      },
      kpis: {
        pedidos_mes: pedidosMes.length,
        total_mes: totalMes,
      },
      saldo_alerta: saldo_alerta,
      vinculo_fornecedor: vinculo_fornecedor,
      extrato: extratoEnriquecido,
      depositos: depositos ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
