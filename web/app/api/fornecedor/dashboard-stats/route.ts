/**
 * GET /api/fornecedor/dashboard-stats
 * Estatísticas para a visão geral do dashboard do fornecedor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string; user_id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id, user_id: userData.user.id };
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { fornecedor_id, org_id, user_id } = ctx;

    // Pedidos aguardando postagem — buscar IDs para criar notificações em falta
    const { data: pedidosParaPostar } = await supabaseAdmin
      .from("pedidos")
      .select("id, valor_fornecedor")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .eq("status", "enviado");

    // Garantir notificação "pedido_para_postar" para cada pedido que não tem
    if (pedidosParaPostar && pedidosParaPostar.length > 0) {
      const { data: notifsExistentes } = await supabaseAdmin
        .from("notifications")
        .select("id, metadata")
        .eq("user_id", user_id)
        .eq("tipo", "pedido_para_postar");
      const idsComNotif = new Set((notifsExistentes ?? []).map((n) => (n.metadata as { pedido_id?: string })?.pedido_id).filter(Boolean));
      for (const p of pedidosParaPostar) {
        if (!idsComNotif.has(p.id)) {
          const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(p.valor_fornecedor ?? 0));
          await supabaseAdmin.from("notifications").insert({
            user_id,
            tipo: "pedido_para_postar",
            titulo: "Novo pedido para postar",
            mensagem: `Você tem um novo pedido de ${valorBRL} aguardando envio.`,
            metadata: { pedido_id: p.id },
          });
          idsComNotif.add(p.id);
        }
      }
    }

    // Início e fim do mês atual (fuso Brasil)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Pedidos aguardando postagem (já buscados acima)
    const pedidosAguardando = pedidosParaPostar?.length ?? 0;

    // 2. Pedidos do mês (enviado, aguardando_repasse, entregue) — usa valor_fornecedor (o que o fornecedor recebe, sem taxa DropCore)
    const { data: pedidosMes } = await supabaseAdmin
      .from("pedidos")
      .select("valor_fornecedor")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .in("status", ["enviado", "aguardando_repasse", "entregue"])
      .gte("criado_em", startOfMonth.toISOString())
      .lte("criado_em", endOfMonth.toISOString());

    const pedidosMesCount = pedidosMes?.length ?? 0;
    const pedidosMesValor = (pedidosMes ?? []).reduce((s, p) => s + Number(p.valor_fornecedor ?? 0), 0);

    // 3. Produtos ativos
    const { count: produtosAtivos } = await supabaseAdmin
      .from("skus")
      .select("id", { count: "exact", head: true })
      .eq("fornecedor_id", fornecedor_id)
      .eq("status", "ativo");

    // 4. Estoque baixo (SKUs com estoque_atual < estoque_minimo)
    const PREFIXO_OCULTO = "DJU999";
    const { data: skusEstoque } = await supabaseAdmin
      .from("skus")
      .select("id, estoque_atual, estoque_minimo")
      .eq("fornecedor_id", fornecedor_id)
      .not("sku", "ilike", `${PREFIXO_OCULTO}%`)
      .limit(2000);

    const estoqueBaixo = (skusEstoque ?? []).filter((r) => {
      const atual = r.estoque_atual;
      const min = r.estoque_minimo;
      return min != null && atual != null && Number(atual) < Number(min);
    }).length;

    // 5. Total a receber (repasses pendente + liberado)
    const { data: repasses } = await supabaseAdmin
      .from("financial_repasse_fornecedor")
      .select("valor_total")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .in("status", ["pendente", "liberado"]);

    const totalAReceber = (repasses ?? []).reduce((s, r) => s + Number(r.valor_total ?? 0), 0);

    return NextResponse.json({
      pedidos_aguardando_postagem: pedidosAguardando ?? 0,
      pedidos_mes_count: pedidosMesCount,
      pedidos_mes_valor: pedidosMesValor,
      produtos_ativos: produtosAtivos ?? 0,
      estoque_baixo: estoqueBaixo,
      total_a_receber: totalAReceber,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
