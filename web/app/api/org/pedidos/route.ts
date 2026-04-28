/**
 * GET /api/org/pedidos - Lista pedidos
 * POST /api/org/pedidos - Cria pedido e bloqueia saldo (block-sale integrado)
 * Body POST: { seller_id, fornecedor_id, valor_fornecedor, valor_dropcore, sku_id, nome_produto? }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { executeBlockSale } from "@/lib/blockSale";
import { isInadimplente } from "@/lib/inadimplencia";
import {
  assertSellerPodeVenderSkus,
  isSellerPlanoPro,
  MSG_STARTER_PEDIDO_SEM_SKU,
} from "@/lib/sellerSkuHabilitado";
import { createOrderCore } from "@/lib/order/createOrderCore";
import { debitarEstoquePedido, reverterEstoquePedido } from "@/lib/order/estoquePedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Erros do `createOrderCore` que devem bloquear a criação do pedido no portal ORG. */
const CORE_BLOCKING_ERRORS = new Set([
  "SELLER_NOT_FOUND",
  "FORNECEDOR_NOT_FOUND",
  "FORNECEDOR_NOT_LINKED",
  "FORNECEDOR_MISMATCH",
  "SELLER_INADIMPLENTE",
  "FORNECEDOR_INADIMPLENTE",
  "SKU_NOT_FOUND",
  "SKU_INACTIVE",
  "SKU_NOT_ENABLED_STARTER",
  "ESTOQUE_INSUFICIENTE",
  "CUSTO_INVALIDO",
  "LIMITE_PLANO_EXCEDIDO",
  "PEDIDO_DUPLICADO",
]);

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
    const sku_id =
      body?.sku_id != null && String(body.sku_id).trim() !== ""
        ? String(body.sku_id).trim()
        : null;
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

    if (sku_id == null) {
      return NextResponse.json(
        {
          ok: false,
          error: "SKU é obrigatório para criar pedido pelo painel da organização.",
          error_code: "SKU_REQUIRED_ORG_ORDER",
        },
        { status: 422 }
      );
    }

    // TODO: no futuro usar essa referencia_externa para bloqueio de duplicidade (igual ERP).
    const referenciaExternaGerada = `ORG-${String(org_id).trim()}-${String(seller_id).trim()}-${Date.now()}`;

    // TODO: reforçar com índice único parcial em banco após saneamento/backfill de dados.
    const { data: pedidoDup, error: pedidoDupErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, status, referencia_externa")
      .eq("org_id", org_id)
      .eq("seller_id", seller_id)
      .eq("referencia_externa", referenciaExternaGerada)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pedidoDupErr) {
      console.error("[pedidos POST] duplicate-check:", pedidoDupErr.message);
      return NextResponse.json({ ok: false, error: "Erro ao validar duplicidade do pedido." }, { status: 500 });
    }
    if (pedidoDup) {
      return NextResponse.json(
        {
          ok: false,
          error: "Já existe pedido com esta referência externa.",
          error_code: "PEDIDO_DUPLICADO",
          pedido_existente: {
            pedido_id: pedidoDup.id,
            status: pedidoDup.status,
            referencia_externa: pedidoDup.referencia_externa,
          },
        },
        { status: 409 }
      );
    }

    const coreResult = await createOrderCore({
      org_id,
      seller_id,
      fornecedor_id,
      origem: "org",
      itens: [
        {
          sku_id,
          quantidade: 1,
        },
      ],
      pedido_meta: {
        referencia_externa: referenciaExternaGerada,
      },
      opcoes: {
        validar_estoque: false,
        baixar_estoque: false,
        permitir_multiplos_itens: false,
        validar_valores_por_sku: false,
      },
    });
    if (coreResult.ok === false) {
      console.warn("[ORDER_CORE_VALIDATION_FAIL]", coreResult);
      const code = coreResult.error_code;
      if (code && CORE_BLOCKING_ERRORS.has(code)) {
        const status =
          typeof coreResult.http_status_sugerido === "number" ? coreResult.http_status_sugerido : 400;
        return NextResponse.json(
          {
            ok: false,
            error: coreResult.error_message ?? "Validação do pedido falhou.",
            error_code: code,
            detalhes: coreResult.detalhes,
          },
          { status }
        );
      }
      const nbStatus =
        typeof coreResult.http_status_sugerido === "number" ? coreResult.http_status_sugerido : 422;
      return NextResponse.json(
        {
          ok: false,
          error: coreResult.error_message ?? "Validação do pedido não concluída.",
          error_code: code ?? "ORDER_CORE_FAILED",
          detalhes: coreResult.detalhes,
        },
        { status: nbStatus }
      );
    }

    const valorFornecedorCore = coreResult.valor_fornecedor ?? 0;
    const valorDropcoreCore = coreResult.valor_dropcore ?? 0;
    const valorTotalCore = coreResult.valor_total ?? 0;
    if (valorTotalCore <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Valores do pedido inválidos no catálogo.",
          error_code: "CORE_VALUES_INVALID",
        },
        { status: 422 }
      );
    }

    const debitoEstoque = await debitarEstoquePedido([
      {
        sku_id,
        quantidade: 1,
      },
    ]);
    if (!debitoEstoque.ok) {
      const status =
        debitoEstoque.error_code === "ESTOQUE_INSUFICIENTE"
          ? 409
          : debitoEstoque.error_code === "ESTOQUE_INPUT_INVALIDO" || debitoEstoque.error_code === "SKU_NOT_FOUND"
            ? 400
            : 500;
      return NextResponse.json(
        {
          ok: false,
          error: debitoEstoque.error_message ?? "Falha ao debitar estoque.",
          error_code: debitoEstoque.error_code ?? "ESTOQUE_DEBITO_FAILED",
          detalhes: debitoEstoque.detalhes,
        },
        { status }
      );
    }
    const estoqueDebitos = debitoEstoque.debitos ?? [];
    const tryReverterEstoque = async (): Promise<void> => {
      if (estoqueDebitos.length === 0) return;
      const rev = await reverterEstoquePedido(estoqueDebitos);
      if (!rev.ok) {
        console.error("[pedidos POST] falha ao reverter estoque:", rev.error_code, rev.error_message, rev.detalhes);
      }
    };

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

    const { data: sellerRow, error: sellerLookupErr } = await supabaseAdmin
      .from("sellers")
      .select("id, plano, fornecedor_id")
      .eq("id", seller_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (sellerLookupErr) {
      console.error("[pedidos POST] seller:", sellerLookupErr.message);
      return NextResponse.json({ error: "Erro ao verificar seller." }, { status: 500 });
    }
    if (!sellerRow) {
      return NextResponse.json({ error: "Seller não encontrado nesta organização." }, { status: 404 });
    }
    if (String(sellerRow.fornecedor_id ?? "") !== String(fornecedor_id)) {
      return NextResponse.json(
        { error: "O fornecedor_id do pedido não coincide com o fornecedor ligado a este seller." },
        { status: 400 }
      );
    }

    const sellerPlano = (sellerRow as { plano?: string | null }).plano;
    if (!isSellerPlanoPro(sellerPlano)) {
      if (!sku_id) {
        return NextResponse.json(
          { error: MSG_STARTER_PEDIDO_SEM_SKU, code: "STARTER_SKU_OBRIGATORIO" },
          { status: 400 }
        );
      }
      const { data: skuCheck, error: skuErr } = await supabaseAdmin
        .from("skus")
        .select("id, sku, org_id, fornecedor_id, status")
        .eq("id", sku_id)
        .maybeSingle();
      if (skuErr) {
        console.error("[pedidos POST] sku:", skuErr.message);
        return NextResponse.json({ error: "Erro ao validar SKU." }, { status: 500 });
      }
      if (!skuCheck || String(skuCheck.org_id) !== org_id || String(skuCheck.fornecedor_id ?? "") !== String(fornecedor_id)) {
        return NextResponse.json({ error: "SKU inválido para este pedido (org/fornecedor)." }, { status: 400 });
      }
      if (String(skuCheck.status ?? "").toLowerCase() !== "ativo") {
        return NextResponse.json({ error: "SKU inativo — não pode ser usado no pedido." }, { status: 400 });
      }
      const vendaOk = await assertSellerPodeVenderSkus(supabaseAdmin, {
        sellerId: seller_id,
        sellerPlano,
        skus: [{ id: skuCheck.id, sku: String(skuCheck.sku ?? "") }],
      });
      if (!vendaOk.ok) {
        return NextResponse.json(
          { error: vendaOk.error, code: "SKU_NAO_HABILITADO_PLANO" },
          { status: 403 }
        );
      }
    }

    // 1) Criar pedido (status enviado; ledger_id preenchido após block-sale)
    const { data: pedido, error: insertErr } = await supabaseAdmin
      .from("pedidos")
      .insert({
        org_id,
        seller_id,
        fornecedor_id,
        valor_fornecedor: valorFornecedorCore,
        valor_dropcore: valorDropcoreCore,
        valor_total: valorTotalCore,
        status: "enviado",
        referencia_externa: referenciaExternaGerada,
        sku_id: sku_id ?? null,
        nome_produto: nome_produto ?? null,
        preco_venda: preco_venda ?? null,
      })
      .select("id, valor_total, criado_em")
      .single();

    if (insertErr) {
      const isUniqueViolation =
        insertErr.code === "23505" ||
        String(insertErr.message ?? "").toLowerCase().includes("duplicate key") ||
        String(insertErr.message ?? "").includes("23505");
      await tryReverterEstoque();
      if (isUniqueViolation) {
        return NextResponse.json(
          {
            ok: false,
            error: "Já existe pedido com esta referência externa.",
            error_code: "PEDIDO_DUPLICADO",
          },
          { status: 409 }
        );
      }
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
      const { error: pedidoItensErr } = await supabaseAdmin.from("pedido_itens").insert({
        pedido_id: pedido.id,
        sku_id,
        nome_produto: nome_produto ?? null,
        quantidade: 1,
        preco_unitario: valorTotalCore,
        valor_total: valorTotalCore,
      });
      if (pedidoItensErr) {
        await tryReverterEstoque();
        await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
        console.error("[pedidos POST] pedido_itens:", pedidoItensErr.message);
        return NextResponse.json({ error: "Erro ao criar itens do pedido.", pedido_id: pedido.id }, { status: 500 });
      }
    }

    // 2) Bloquear saldo (block-sale)
    const blockResult = await executeBlockSale({
      org_id,
      seller_id,
      fornecedor_id,
      pedido_id: pedido.id,
      valor_fornecedor: valorFornecedorCore,
      valor_dropcore: valorDropcoreCore,
    });

    if (!blockResult.ok) {
      await tryReverterEstoque();
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
      const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        valorFornecedorCore
      );
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
