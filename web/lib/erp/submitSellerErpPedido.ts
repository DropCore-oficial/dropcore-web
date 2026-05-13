import { executeBlockSale } from "@/lib/blockSale";
import { fireErpEstoqueWebhook } from "@/lib/erpEstoqueOutbound";
import { isInadimplente } from "@/lib/inadimplencia";
import { notifyEstoqueBaixo } from "@/lib/notifyEstoqueBaixo";
import { debitarEstoquePedido, reverterEstoquePedido } from "@/lib/order/estoquePedido";
import { assertSellerPodeVenderSkus } from "@/lib/sellerSkuHabilitado";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SubmitSellerErpPedidoItem = {
  sku: string;
  quantidade: number;
};

export type SubmitSellerErpPedidoInput = {
  org_id: string;
  seller: {
    id: string;
    fornecedor_id: string | null;
    plano?: string | null;
    erp_estoque_webhook_url?: string | null;
    erp_estoque_webhook_secret?: string | null;
  };
  referencia_externa: string | null;
  tracking_codigo?: string | null;
  metodo_envio?: string | null;
  items: SubmitSellerErpPedidoItem[];
};

export type SubmitSellerErpPedidoResult =
  | {
      ok: true;
      pedido_id: string;
      valor_total: number;
      status: string;
      estoque_atual_por_sku: Array<{ sku: string; estoque_atual: number }>;
    }
  | {
      ok: false;
      error_code: string;
      error_message: string;
      http_status: number;
      pedido_existente?: {
        pedido_id: string;
        status: string;
        referencia_externa: string | null;
      };
    };

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v ?? "0").replace(",", "."));
}

async function addPedidoEvento(params: {
  org_id: string;
  pedido_id: string;
  tipo: string;
  origem: "erp" | "manual" | "sistema";
  actor_id?: string | null;
  actor_tipo?: "seller" | "fornecedor" | "admin" | "sistema" | null;
  descricao?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await supabaseAdmin.from("pedido_eventos").insert({
    org_id: params.org_id,
    pedido_id: params.pedido_id,
    tipo: params.tipo,
    origem: params.origem,
    actor_id: params.actor_id ?? null,
    actor_tipo: params.actor_tipo ?? null,
    descricao: params.descricao ?? null,
    metadata: params.metadata ?? null,
  });
}

export async function submitSellerErpPedido(
  input: SubmitSellerErpPedidoInput
): Promise<SubmitSellerErpPedidoResult> {
  const org_id = input.org_id.trim();
  const seller = input.seller;
  const referencia_externa = input.referencia_externa?.trim() || null;
  const tracking_codigo = input.tracking_codigo?.trim() || null;
  const metodo_envio = input.metodo_envio?.trim() || null;
  const items = input.items
    .map((item) => ({
      sku: item.sku.trim(),
      quantidade: Math.max(1, Math.floor(item.quantidade)),
    }))
    .filter((item) => item.sku);

  if (items.length === 0) {
    return {
      ok: false,
      error_code: "ITEMS_INVALIDOS",
      error_message: "items deve conter ao menos um item com sku.",
      http_status: 400,
    };
  }

  if (referencia_externa) {
    const { data: pedidoDup, error: pedidoDupErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, status, referencia_externa")
      .eq("org_id", org_id)
      .eq("seller_id", seller.id)
      .eq("referencia_externa", referencia_externa)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pedidoDupErr) {
      return {
        ok: false,
        error_code: "INTERNAL_ERROR",
        error_message: "Erro ao validar duplicidade do pedido.",
        http_status: 500,
      };
    }

    if (pedidoDup) {
      return {
        ok: false,
        error_code: "PEDIDO_DUPLICADO",
        error_message: "Já existe pedido com esta referência externa.",
        http_status: 409,
        pedido_existente: {
          pedido_id: pedidoDup.id,
          status: pedidoDup.status,
          referencia_externa: pedidoDup.referencia_externa,
        },
      };
    }
  }

  const fornecedor_id = seller.fornecedor_id;
  if (!fornecedor_id) {
    return {
      ok: false,
      error_code: "FORNECEDOR_NOT_LINKED",
      error_message: "Seller não está vinculado a um fornecedor.",
      http_status: 400,
    };
  }

  const [sellerInad, fornInad] = await Promise.all([
    isInadimplente(supabaseAdmin, org_id, "seller", seller.id),
    isInadimplente(supabaseAdmin, org_id, "fornecedor", fornecedor_id),
  ]);
  if (sellerInad) {
    return {
      ok: false,
      error_code: "SELLER_INADIMPLENTE",
      error_message: "Seller inadimplente.",
      http_status: 403,
    };
  }
  if (fornInad) {
    return {
      ok: false,
      error_code: "FORNECEDOR_INADIMPLENTE",
      error_message: "Fornecedor inadimplente.",
      http_status: 403,
    };
  }

  let valor_fornecedor = 0;
  let valor_dropcore = 0;
  const skuRows: {
    id: string;
    sku: string;
    estoque_atual: number;
    estoque_minimo: number | null;
    nome_produto: string | null;
    custo_base: number;
    custo_dropcore: number;
    expedicao_override_linha: string | null;
  }[] = [];

  for (const item of items) {
    const { data: sku, error: skuErr } = await supabaseAdmin
      .from("skus")
      .select(
        "id, sku, nome_produto, estoque_atual, estoque_minimo, custo_base, custo_dropcore, expedicao_override_linha"
      )
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .ilike("sku", item.sku)
      .eq("status", "ativo")
      .maybeSingle();

    if (skuErr || !sku) {
      return {
        ok: false,
        error_code: "SKU_NOT_FOUND",
        error_message: `SKU não encontrado ou inativo: ${item.sku}`,
        http_status: 404,
      };
    }

    const estoque = Number(sku.estoque_atual ?? 0);
    if (estoque < item.quantidade) {
      return {
        ok: false,
        error_code: "ESTOQUE_INSUFICIENTE",
        error_message: `Estoque insuficiente para SKU ${item.sku}. Disponível: ${estoque}, solicitado: ${item.quantidade}`,
        http_status: 422,
      };
    }

    const custoBase = toNum(sku.custo_base);
    const custoDropcore = toNum(sku.custo_dropcore);
    valor_fornecedor += custoBase * item.quantidade;
    valor_dropcore += custoDropcore * item.quantidade;
    skuRows.push({
      id: sku.id,
      sku: sku.sku,
      estoque_atual: estoque,
      estoque_minimo: sku.estoque_minimo != null ? Number(sku.estoque_minimo) : null,
      nome_produto: sku.nome_produto ?? null,
      custo_base: custoBase,
      custo_dropcore: custoDropcore,
      expedicao_override_linha: (sku as { expedicao_override_linha?: string | null }).expedicao_override_linha ?? null,
    });
  }

  if (skuRows.length > 1) {
    let expedicaoPadrao = "";
    const { data: fornRow, error: fornExpErr } = await supabaseAdmin
      .from("fornecedores")
      .select("expedicao_padrao_linha")
      .eq("id", fornecedor_id)
      .maybeSingle();
    const colMissing =
      fornExpErr &&
      (String(fornExpErr.message ?? "").toLowerCase().includes("column") || fornExpErr.code === "42703");
    if (!fornExpErr && !colMissing) {
      expedicaoPadrao = String((fornRow as { expedicao_padrao_linha?: string | null })?.expedicao_padrao_linha ?? "").trim();
    }
    const linhaDespacho = (row: (typeof skuRows)[0]) => {
      const ov = String(row.expedicao_override_linha ?? "").trim();
      return ov || expedicaoPadrao;
    };
    const chaves = new Set(skuRows.map((r) => linhaDespacho(r)));
    if (chaves.size > 1) {
      return {
        ok: false,
        error_code: "DESPACHO_CD_MISTO",
        error_message:
          "Este pedido mistura CDs ou endereços de despacho diferentes. Separe em envios distintos ou alinhe o despacho nos SKUs.",
        http_status: 400,
      };
    }
  }

  const valor_total = valor_fornecedor + valor_dropcore;
  if (valor_total <= 0) {
    return {
      ok: false,
      error_code: "VALOR_INVALIDO",
      error_message: "Valor total do pedido deve ser positivo.",
      http_status: 400,
    };
  }

  const vendaSkuCheck = await assertSellerPodeVenderSkus(supabaseAdmin, {
    sellerId: seller.id,
    sellerPlano: seller.plano,
    skus: skuRows.map((r) => ({ id: r.id, sku: r.sku })),
  });
  if (!vendaSkuCheck.ok) {
    return {
      ok: false,
      error_code: "SKU_NAO_HABILITADO_PLANO",
      error_message: vendaSkuCheck.error,
      http_status: 403,
    };
  }

  const { data: orgRow } = await supabaseAdmin.from("orgs").select("plano").eq("id", org_id).maybeSingle();
  const orgPlano = String(orgRow?.plano ?? "starter").toLowerCase();
  if (orgPlano === "starter") {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .gte("criado_em", inicioMes.toISOString())
      .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido");
    if (typeof count === "number" && count >= 200) {
      return {
        ok: false,
        error_code: "LIMITE_PLANO_EXCEDIDO",
        error_message: "Limite de vendas do plano Starter atingido.",
        http_status: 403,
      };
    }
  }

  const debitoEstoque = await debitarEstoquePedido(
    items.map((item, i) => ({
      sku_id: skuRows[i].id,
      sku: skuRows[i].sku,
      quantidade: item.quantidade,
    }))
  );
  if (!debitoEstoque.ok) {
    return {
      ok: false,
      error_code: debitoEstoque.error_code ?? "ESTOQUE_DEBITO_FALHOU",
      error_message: debitoEstoque.error_message ?? "Erro ao atualizar estoque.",
      http_status:
        debitoEstoque.error_code === "ESTOQUE_INSUFICIENTE"
          ? 409
          : debitoEstoque.error_code === "SKU_NOT_FOUND"
            ? 404
            : debitoEstoque.error_code === "ESTOQUE_INPUT_INVALIDO"
              ? 400
              : 500,
    };
  }

  const estoqueDebitos = debitoEstoque.debitos ?? [];
  const tryReverterEstoque = async (): Promise<void> => {
    if (estoqueDebitos.length === 0) return;
    const rev = await reverterEstoquePedido(estoqueDebitos);
    if (!rev.ok) {
      console.error("[submitSellerErpPedido] estoque rollback:", rev.error_code, rev.error_message, rev.detalhes);
    }
  };

  const produtosAbaixoDoMin: { sku: string; nome?: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sku = skuRows[i];
    const novoEstoque = sku.estoque_atual - item.quantidade;
    if (sku.estoque_minimo != null && novoEstoque < sku.estoque_minimo) {
      produtosAbaixoDoMin.push({ sku: sku.sku, nome: sku.nome_produto ?? undefined });
    }
  }
  if (produtosAbaixoDoMin.length > 0) {
    await notifyEstoqueBaixo({ org_id, fornecedor_id, produtos: produtosAbaixoDoMin });
  }

  const { data: pedido, error: insertErr } = await supabaseAdmin
    .from("pedidos")
    .insert({
      org_id,
      seller_id: seller.id,
      fornecedor_id,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      status: "enviado",
      referencia_externa,
      tracking_codigo,
      metodo_envio,
    })
    .select("id, valor_total, criado_em")
    .single();

  if (insertErr) {
    const isUniqueViolation =
      insertErr.code === "23505" ||
      String(insertErr.message ?? "").toLowerCase().includes("duplicate key") ||
      String(insertErr.message ?? "").includes("23505");
    if (isUniqueViolation) {
      await tryReverterEstoque();
      return {
        ok: false,
        error_code: "PEDIDO_DUPLICADO",
        error_message: "Já existe pedido com esta referência externa.",
        http_status: 409,
      };
    }
    await tryReverterEstoque();
    return {
      ok: false,
      error_code: "INTERNAL_ERROR",
      error_message: "Erro ao criar pedido.",
      http_status: 500,
    };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sku = skuRows[i];
    const precoUnit = sku.custo_base + sku.custo_dropcore;
    const valorItem = precoUnit * item.quantidade;
    const { error: pedidoItemErr } = await supabaseAdmin.from("pedido_itens").insert({
      pedido_id: pedido.id,
      sku_id: sku.id,
      quantidade: item.quantidade,
      preco_unitario: precoUnit,
      valor_total: valorItem,
    });
    if (pedidoItemErr) {
      await tryReverterEstoque();
      await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      return {
        ok: false,
        error_code: "INTERNAL_ERROR",
        error_message: "Erro ao criar itens do pedido.",
        http_status: 500,
      };
    }
  }

  const blockResult = await executeBlockSale({
    org_id,
    seller_id: seller.id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor,
    valor_dropcore,
  });

  if (!blockResult.ok) {
    await tryReverterEstoque();
    if (blockResult.code === "SALDO_INSUFICIENTE") {
      await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
      return {
        ok: false,
        error_code: "SALDO_INSUFICIENTE",
        error_message: "Saldo insuficiente para este pedido.",
        http_status: 402,
      };
    }
    await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
    return {
      ok: false,
      error_code: blockResult.code ?? "BLOCK_SALE_FAILED",
      error_message:
        blockResult.code === "SELLER_NAO_ENCONTRADO"
          ? "Seller não encontrado."
          : blockResult.code === "ERRO_LEDGER"
            ? blockResult.message
            : "Erro ao processar pedido.",
      http_status: 500,
    };
  }

  await supabaseAdmin
    .from("pedidos")
    .update({ ledger_id: blockResult.ledger_id, atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id);

  fireErpEstoqueWebhook({
    webhookUrl: seller.erp_estoque_webhook_url,
    webhookSecret: seller.erp_estoque_webhook_secret,
    payload: {
      event: "dropcore.estoque_atualizado",
      pedido_id: pedido.id,
      referencia_externa,
      seller_id: seller.id,
      org_id,
      items: items.map((it, i) => ({
        sku: skuRows[i].sku,
        quantidade_vendida: it.quantidade,
        estoque_atual_dropcore: skuRows[i].estoque_atual - it.quantidade,
      })),
    },
  });

  await addPedidoEvento({
    org_id,
    pedido_id: pedido.id,
    tipo: "pedido_criado",
    origem: "erp",
    actor_id: seller.id,
    actor_tipo: "seller",
    descricao: "Pedido criado via integração ERP.",
    metadata: { referencia_externa },
  });

  return {
    ok: true,
    pedido_id: pedido.id,
    valor_total: blockResult.valor_total,
    status: blockResult.status,
    estoque_atual_por_sku: items.map((it, i) => ({
      sku: skuRows[i].sku,
      estoque_atual: skuRows[i].estoque_atual - it.quantidade,
    })),
  };
}
