/**
 * GET /api/org/pedidos - Lista pedidos
 * POST /api/org/pedidos - Cria pedido e bloqueia saldo (block-sale integrado)
 * Body POST: { seller_id, fornecedor_id, valor_fornecedor, valor_dropcore, sku_id?, nome_produto? }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { executeBlockSale } from "@/lib/blockSale";
import { isInadimplente } from "@/lib/inadimplencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v ?? "0").replace(",", "."));
}

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10) || 50);

    let query = supabaseAdmin
      .from("pedidos")
      .select(
        "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, valor_dropcore, valor_total, status, ledger_id, criado_em"
      )
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false })
      .limit(limit);

    if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json([]);
      }
      console.error("[pedidos GET]", error.message);
      return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
    }

    // Enriquecer com nomes de seller e fornecedor
    const sellerIds = [...new Set((data ?? []).map((p) => p.seller_id))];
    const fornIds = [...new Set((data ?? []).map((p) => p.fornecedor_id))];

    const [sellersRes, fornRes] = await Promise.all([
      sellerIds.length > 0
        ? supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds)
        : { data: [] },
      fornIds.length > 0
        ? supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornIds)
        : { data: [] },
    ]);

    const sellersMap = new Map((sellersRes.data ?? []).map((s) => [s.id, s.nome]));
    const fornMap = new Map((fornRes.data ?? []).map((f) => [f.id, f.nome]));

    const enriched = (data ?? []).map((p) => ({
      ...p,
      seller_nome: sellersMap.get(p.seller_id) ?? "—",
      fornecedor_nome: fornMap.get(p.fornecedor_id) ?? "—",
    }));

    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);
    const body = await req.json();
    const seller_id = body?.seller_id ?? null;
    const fornecedor_id = body?.fornecedor_id ?? null;
    const valor_fornecedor = toNum(body?.valor_fornecedor);
    const valor_dropcore = toNum(body?.valor_dropcore);
    const sku_id = body?.sku_id ? String(body.sku_id) : null;
    const nome_produto = body?.nome_produto ? String(body.nome_produto).trim() : null;
    const preco_venda = body?.preco_venda ? toNum(body.preco_venda) : null;

    if (!seller_id || !fornecedor_id) {
      return NextResponse.json({ error: "seller_id e fornecedor_id são obrigatórios." }, { status: 400 });
    }
    if (valor_fornecedor < 0 || valor_dropcore < 0) {
      return NextResponse.json({ error: "valor_fornecedor e valor_dropcore devem ser >= 0." }, { status: 400 });
    }
    const valor_total = valor_fornecedor + valor_dropcore;
    if (valor_total <= 0) {
      return NextResponse.json({ error: "valor_total deve ser positivo." }, { status: 400 });
    }

    const orgPlano = String(plano ?? "starter").toLowerCase();

    // Regra: fornecedor premium só para plano Pro
    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select("premium")
      .eq("id", fornecedor_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (fornErr) {
      console.error("[pedidos POST] fornecedor query:", fornErr.message);
      return NextResponse.json({ error: "Erro ao verificar fornecedor." }, { status: 500 });
    }
    if (!forn) return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    if (forn.premium && orgPlano !== "pro") {
      return NextResponse.json(
        { error: "Este fornecedor é Premium. Disponível apenas no Plano Pro.", code: "FORNECEDOR_PREMIUM" },
        { status: 403 }
      );
    }

    // Regra: limite 200 vendas/mês para Starter
    if (orgPlano === "starter") {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const { count, error: countErr } = await supabaseAdmin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org_id)
        .gte("criado_em", inicioMes.toISOString())
        .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido");
      if (!countErr && typeof count === "number" && count >= 200) {
        return NextResponse.json(
          { error: "Limite de 200 vendas do plano Starter atingido. Faça upgrade para Pro." },
          { status: 403 }
        );
      }
    }

    // Regra: inadimplência bloqueia pedido
    const [sellerInadimplente, fornInadimplente] = await Promise.all([
      isInadimplente(supabaseAdmin, org_id, "seller", seller_id),
      isInadimplente(supabaseAdmin, org_id, "fornecedor", fornecedor_id),
    ]);
    if (sellerInadimplente) {
      return NextResponse.json(
        { error: "Seller inadimplente. Regularize as mensalidades pendentes antes de criar pedidos.", code: "SELLER_INADIMPLENTE" },
        { status: 403 }
      );
    }
    if (fornInadimplente) {
      return NextResponse.json(
        { error: "Fornecedor inadimplente. Regularize as mensalidades pendentes antes de criar pedidos.", code: "FORNECEDOR_INADIMPLENTE" },
        { status: 403 }
      );
    }

    // 1) Criar pedido (status enviado; ledger_id preenchido após block-sale)
    const { data: pedido, error: insertErr } = await supabaseAdmin
      .from("pedidos")
      .insert({
        org_id,
        seller_id,
        fornecedor_id,
        valor_fornecedor,
        valor_dropcore,
        valor_total,
        status: "enviado",
        sku_id: sku_id ?? null,
        nome_produto: nome_produto ?? null,
        preco_venda: preco_venda ?? null,
      })
      .select("id, valor_total, criado_em")
      .single();

    if (insertErr) {
      if (insertErr.message?.includes("does not exist") || insertErr.code === "42P01") {
        return NextResponse.json(
          { error: "Tabela pedidos não existe. Execute o script create-pedidos.sql." },
          { status: 503 }
        );
      }
      console.error("[pedidos POST] insert:", insertErr.message);
      return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
    }

    // 1b) Salvar item do pedido se SKU informado
    if (sku_id) {
      await supabaseAdmin.from("pedido_itens").insert({
        pedido_id: pedido.id,
        sku_id,
        nome_produto: nome_produto ?? null,
        quantidade: 1,
        preco_unitario: valor_total,
        valor_total,
      }).then(({ error }) => {
        if (error) console.error("[pedidos POST] pedido_itens:", error.message);
      });
    }

    // 2) Bloquear saldo (block-sale)
    const blockResult = await executeBlockSale({
      org_id,
      seller_id,
      fornecedor_id,
      pedido_id: pedido.id,
      valor_fornecedor,
      valor_dropcore,
    });

    if (!blockResult.ok) {
      if (blockResult.code === "SALDO_INSUFICIENTE") {
        await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
        return NextResponse.json(
          {
            error: "Saldo insuficiente para este pedido.",
            code: "SALDO_INSUFICIENTE",
            saldo_disponivel: blockResult.saldo_disponivel,
            valor_total: blockResult.valor_total,
            pedido_id: pedido.id,
          },
          { status: 402 }
        );
      }
      await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      return NextResponse.json(
        {
          error:
            blockResult.code === "SELLER_NAO_ENCONTRADO"
              ? "Seller não encontrado."
              : blockResult.code === "LEDGER_NAO_DISPONIVEL"
                ? "Ledger não disponível."
                : blockResult.message ?? "Erro ao bloquear saldo.",
          pedido_id: pedido.id,
        },
        { status: blockResult.code === "SELLER_NAO_ENCONTRADO" ? 404 : 500 }
      );
    }

    // 3) Atualizar pedido com ledger_id
    await supabaseAdmin
      .from("pedidos")
      .update({ ledger_id: blockResult.ledger_id, atualizado_em: new Date().toISOString() })
      .eq("id", pedido.id);

    // 4) Notificação para fornecedor: novo pedido para postar
    let memberUserId: string | null = null;
    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .limit(1)
      .maybeSingle();
    memberUserId = member?.user_id ?? null;
    if (!memberUserId) {
      const { data: fallback } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("fornecedor_id", fornecedor_id)
        .limit(1)
        .maybeSingle();
      memberUserId = fallback?.user_id ?? null;
    }
    if (memberUserId) {
      const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor_fornecedor);
      await supabaseAdmin.from("notifications").insert({
        user_id: memberUserId,
        tipo: "pedido_para_postar",
        titulo: "Novo pedido para postar",
        mensagem: `Você tem um novo pedido de ${valorBRL} aguardando envio.`,
        metadata: { pedido_id: pedido.id },
      });
    }

    return NextResponse.json({
      ok: true,
      pedido_id: pedido.id,
      ledger_id: blockResult.ledger_id,
      valor_total: blockResult.valor_total,
      status: blockResult.status,
      ciclo_repasse: blockResult.ciclo_repasse,
      criado_em: pedido.criado_em,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
