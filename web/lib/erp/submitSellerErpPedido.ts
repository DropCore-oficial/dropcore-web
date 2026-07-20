import { executeBlockSale } from "@/lib/blockSale";
import { fireErpEstoqueWebhook } from "@/lib/erpEstoqueOutbound";
import { isInadimplente } from "@/lib/inadimplencia";
import { notifyEstoqueBaixo } from "@/lib/notifyEstoqueBaixo";
import { notifyFornecedorPedidoParaPostar } from "@/lib/notifyFornecedorPedidoParaPostar";
import { notifySellerPedidoAtencao } from "@/lib/notifySellerPedidoAtencao";
import { motivoBloqueioParaPortal, type PedidoBloqueioResponsavel } from "@/lib/pedidoBloqueioResponsavel";
import { debitarEstoquePedido, reverterEstoquePedido } from "@/lib/order/estoquePedido";
import { resolveTaxaDropcoreUnit } from "@/lib/order/resolveTaxaDropcore";
import { assertSellerPodeVenderSkus } from "@/lib/sellerSkuHabilitado";
import { dispararSyncEstoqueOlistFornecedorSkus } from "@/lib/sellerOlistSyncEstoqueOnChange";
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
  meta?: {
    nome_produto?: string | null;
    marketplace_numero?: string | null;
    comprador_nome?: string | null;
    comprador_cidade?: string | null;
    comprador_uf?: string | null;
    comprador_fone?: string | null;
    canal_venda?: string | null;
  };
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

type SkuRowResolved = {
  id: string;
  sku: string;
  estoque_atual: number;
  estoque_minimo: number | null;
  nome_produto: string | null;
  custo_base: number;
  custo_dropcore: number;
  expedicao_override_linha: string | null;
};

export async function addPedidoEvento(params: {
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

/**
 * Cria uma linha "placeholder" em `pedidos` pra vendas reais que não completam o fluxo
 * normal ainda (estoque zerado ou bloqueio de regra de negócio) — sem isso, o pedido
 * simplesmente some do DropCore em vez de aparecer pro seller resolver.
 */
async function insertPedidoPlaceholder(params: {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
  referencia_externa: string | null;
  tracking_codigo: string | null;
  metodo_envio: string | null;
  meta: SubmitSellerErpPedidoInput["meta"];
  valor_fornecedor: number;
  valor_dropcore: number;
  valor_total: number;
  items: SubmitSellerErpPedidoItem[];
  skuRows: SkuRowResolved[];
  status: "pendente_estoque" | "bloqueado";
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: PedidoBloqueioResponsavel | null;
  evento: { tipo: string; descricao: string };
  notify: (pedido_id: string) => Promise<void>;
}): Promise<SubmitSellerErpPedidoResult> {
  const meta = params.meta ?? {};
  const { data: pedidoPlaceholder, error: insertErr } = await supabaseAdmin
    .from("pedidos")
    .insert({
      org_id: params.org_id,
      seller_id: params.seller_id,
      fornecedor_id: params.fornecedor_id,
      valor_fornecedor: params.valor_fornecedor,
      valor_dropcore: params.valor_dropcore,
      valor_total: params.valor_total,
      status: params.status,
      motivo_bloqueio: params.motivo_bloqueio ?? null,
      motivo_bloqueio_responsavel: params.motivo_bloqueio_responsavel ?? null,
      referencia_externa: params.referencia_externa,
      tracking_codigo: params.tracking_codigo,
      metodo_envio: params.metodo_envio,
      sku_id: params.skuRows[0]?.id ?? null,
      nome_produto: meta.nome_produto?.trim() || params.skuRows[0]?.nome_produto || null,
      marketplace_numero: meta.marketplace_numero?.trim() || null,
      comprador_nome: meta.comprador_nome?.trim() || null,
      comprador_cidade: meta.comprador_cidade?.trim() || null,
      comprador_uf: meta.comprador_uf?.trim() || null,
      comprador_fone: meta.comprador_fone?.trim() || null,
      canal_venda: meta.canal_venda?.trim() || null,
    })
    .select("id, valor_total")
    .single();

  if (insertErr || !pedidoPlaceholder) {
    const isUniqueViolation =
      insertErr?.code === "23505" || String(insertErr?.message ?? "").toLowerCase().includes("duplicate key");
    if (isUniqueViolation && params.referencia_externa) {
      const { data: pedidoPosRace } = await supabaseAdmin
        .from("pedidos")
        .select("id, status, referencia_externa")
        .eq("org_id", params.org_id)
        .eq("seller_id", params.seller_id)
        .eq("referencia_externa", params.referencia_externa)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pedidoPosRace) {
        return {
          ok: false,
          error_code: "PEDIDO_DUPLICADO",
          error_message: "Já existe pedido com esta referência externa.",
          http_status: 409,
          pedido_existente: {
            pedido_id: pedidoPosRace.id,
            status: pedidoPosRace.status,
            referencia_externa: pedidoPosRace.referencia_externa,
          },
        };
      }
    }
    return {
      ok: false,
      error_code: "INTERNAL_ERROR",
      error_message: insertErr?.message ?? "Erro ao criar pedido.",
      http_status: 500,
    };
  }

  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    const sku = params.skuRows[i];
    const precoUnit = sku.custo_base + sku.custo_dropcore;
    const valorItem = precoUnit * item.quantidade;
    const { error: pedidoItemErr } = await supabaseAdmin.from("pedido_itens").insert({
      pedido_id: pedidoPlaceholder.id,
      sku_id: sku.id,
      quantidade: item.quantidade,
      preco_unitario: precoUnit,
      valor_total: valorItem,
    });
    if (pedidoItemErr) {
      await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedidoPlaceholder.id);
      return {
        ok: false,
        error_code: "INTERNAL_ERROR",
        error_message: "Erro ao criar itens do pedido.",
        http_status: 500,
      };
    }
  }

  await addPedidoEvento({
    org_id: params.org_id,
    pedido_id: pedidoPlaceholder.id,
    tipo: params.evento.tipo,
    origem: "erp",
    actor_id: params.seller_id,
    actor_tipo: "seller",
    descricao: params.evento.descricao,
    metadata: { referencia_externa: params.referencia_externa },
  });

  await params.notify(pedidoPlaceholder.id);

  return {
    ok: true,
    pedido_id: pedidoPlaceholder.id,
    valor_total: Number(pedidoPlaceholder.valor_total ?? params.valor_total),
    status: params.status,
    estoque_atual_por_sku: params.skuRows.map((sku) => ({
      sku: sku.sku,
      estoque_atual: sku.estoque_atual,
    })),
  };
}

export async function submitSellerErpPedido(
  input: SubmitSellerErpPedidoInput
): Promise<SubmitSellerErpPedidoResult> {
  const org_id = input.org_id.trim();
  const seller = input.seller;
  const referencia_externa = input.referencia_externa?.trim() || null;
  const tracking_codigo = input.tracking_codigo?.trim() || null;
  const metodo_envio = input.metodo_envio?.trim() || null;
  const meta = input.meta ?? {};
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

  let valor_fornecedor = 0;
  let valor_dropcore = 0;
  let pendenteEstoque = false;
  const skuRows: SkuRowResolved[] = [];

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
      pendenteEstoque = true;
    }

    const custoBase = toNum(sku.custo_base);
    const custoDropcore = resolveTaxaDropcoreUnit(custoBase, sku.custo_dropcore);
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

  let bloqueio: { error_code: string; error_message: string; responsavel: PedidoBloqueioResponsavel } | null = null;

  const [sellerInad, fornInad] = await Promise.all([
    isInadimplente(supabaseAdmin, org_id, "seller", seller.id),
    isInadimplente(supabaseAdmin, org_id, "fornecedor", fornecedor_id),
  ]);
  if (sellerInad) {
    bloqueio = { error_code: "SELLER_INADIMPLENTE", error_message: "Seller inadimplente.", responsavel: "seller" };
  } else if (fornInad) {
    bloqueio = { error_code: "FORNECEDOR_INADIMPLENTE", error_message: "Fornecedor inadimplente.", responsavel: "fornecedor" };
  }

  if (!bloqueio && skuRows.length > 1) {
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
    const linhaDespacho = (row: SkuRowResolved) => {
      const ov = String(row.expedicao_override_linha ?? "").trim();
      return ov || expedicaoPadrao;
    };
    const chaves = new Set(skuRows.map((r) => linhaDespacho(r)));
    if (chaves.size > 1) {
      bloqueio = {
        error_code: "DESPACHO_CD_MISTO",
        error_message:
          "Este pedido mistura CDs ou endereços de despacho diferentes. Separe em envios distintos ou alinhe o despacho nos SKUs.",
        responsavel: "fornecedor",
      };
    }
  }

  const valor_total = valor_fornecedor + valor_dropcore;
  if (!bloqueio && valor_total <= 0) {
    bloqueio = {
      error_code: "VALOR_INVALIDO",
      error_message: "Valor total do pedido deve ser positivo.",
      responsavel: "fornecedor",
    };
  }

  if (!bloqueio) {
    const vendaSkuCheck = await assertSellerPodeVenderSkus(supabaseAdmin, {
      sellerId: seller.id,
      sellerPlano: seller.plano,
      skus: skuRows.map((r) => ({ id: r.id, sku: r.sku })),
    });
    if (!vendaSkuCheck.ok) {
      bloqueio = { error_code: "SKU_NAO_HABILITADO_PLANO", error_message: vendaSkuCheck.error, responsavel: "seller" };
    }
  }

  if (bloqueio) {
    const motivo = bloqueio.error_message;
    const motivoParaSeller = motivoBloqueioParaPortal({
      portal: "seller",
      responsavel: bloqueio.responsavel,
      motivoCompleto: motivo,
    });
    const motivoParaFornecedor = motivoBloqueioParaPortal({
      portal: "fornecedor",
      responsavel: bloqueio.responsavel,
      motivoCompleto: motivo,
    });
    return insertPedidoPlaceholder({
      org_id,
      seller_id: seller.id,
      fornecedor_id,
      referencia_externa,
      tracking_codigo,
      metodo_envio,
      meta: input.meta,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      items,
      skuRows,
      status: "bloqueado",
      motivo_bloqueio: motivo,
      motivo_bloqueio_responsavel: bloqueio.responsavel,
      evento: { tipo: "pedido_bloqueado", descricao: `Pedido bloqueado: ${motivo}` },
      notify: (pedido_id) =>
        Promise.all([
          notifySellerPedidoAtencao({
            org_id,
            seller_id: seller.id,
            pedido_id,
            tipo: "pedido_bloqueado",
            motivo: motivoParaSeller ?? motivo,
          }),
          notifyFornecedorPedidoParaPostar({
            org_id,
            fornecedor_id,
            pedido_id,
            valor_fornecedor,
            motivo: "bloqueado",
            motivo_bloqueio: motivoParaFornecedor,
          }),
        ]).then(() => undefined),
    });
  }

  if (pendenteEstoque) {
    return insertPedidoPlaceholder({
      org_id,
      seller_id: seller.id,
      fornecedor_id,
      referencia_externa,
      tracking_codigo,
      metodo_envio,
      meta: input.meta,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      items,
      skuRows,
      status: "pendente_estoque",
      evento: {
        tipo: "pedido_pendente_estoque",
        descricao: "Pedido importado aguardando reposição de estoque no DropCore.",
      },
      notify: (pedido_id) =>
        Promise.all([
          notifyFornecedorPedidoParaPostar({
            org_id,
            fornecedor_id,
            pedido_id,
            valor_fornecedor,
            motivo: "estoque",
          }),
          notifySellerPedidoAtencao({
            org_id,
            seller_id: seller.id,
            pedido_id,
            tipo: "pedido_pendente_estoque",
            motivo: "Pedido importado, mas o estoque no DropCore está zerado. Aguardando reposição.",
          }),
        ]).then(() => undefined),
    });
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
      sku_id: skuRows[0]?.id ?? null,
      nome_produto: meta.nome_produto?.trim() || skuRows[0]?.nome_produto || null,
      marketplace_numero: meta.marketplace_numero?.trim() || null,
      comprador_nome: meta.comprador_nome?.trim() || null,
      comprador_cidade: meta.comprador_cidade?.trim() || null,
      comprador_uf: meta.comprador_uf?.trim() || null,
      comprador_fone: meta.comprador_fone?.trim() || null,
      canal_venda: meta.canal_venda?.trim() || null,
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
      // Corrida: duas importações podem passar na checagem pré-insert; a perdedora
      // cai em 23505 sem ter visto o pedido ainda. Reconsulta pela referência.
      if (referencia_externa) {
        const { data: pedidoPosRace, error: pedidoPosRaceErr } = await supabaseAdmin
          .from("pedidos")
          .select("id, status, referencia_externa")
          .eq("org_id", org_id)
          .eq("seller_id", seller.id)
          .eq("referencia_externa", referencia_externa)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!pedidoPosRaceErr && pedidoPosRace) {
          return {
            ok: false,
            error_code: "PEDIDO_DUPLICADO",
            error_message: "Já existe pedido com esta referência externa.",
            http_status: 409,
            pedido_existente: {
              pedido_id: pedidoPosRace.id,
              status: pedidoPosRace.status,
              referencia_externa: pedidoPosRace.referencia_externa,
            },
          };
        }
      }
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
    if (blockResult.code === "SALDO_INSUFICIENTE") {
      // Mantém o estoque debitado (não reverte): o pedido já é uma venda confirmada,
      // então a unidade fica retida especificamente pra ele até o saldo ser resolvido
      // (retry) ou o prazo expirar — ver tryPromoteErroSaldoPedido / pedidosErroSaldoRetry.
      await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
      notifySellerPedidoAtencao({
        org_id,
        seller_id: seller.id,
        pedido_id: pedido.id,
        tipo: "erro_saldo",
        motivo: `Saldo insuficiente para o pedido${referencia_externa ? ` ${referencia_externa}` : ""} (R$ ${blockResult.valor_total.toFixed(2)}). Saldo disponível: R$ ${blockResult.saldo_disponivel.toFixed(2)}. Recarregue seus créditos DropCore.`,
      });
      return {
        ok: false,
        error_code: "SALDO_INSUFICIENTE",
        error_message: "Saldo insuficiente para este pedido.",
        http_status: 402,
      };
    }
    await tryReverterEstoque();
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

  if (fornecedor_id) {
    dispararSyncEstoqueOlistFornecedorSkus({
      orgId: org_id,
      fornecedorId: fornecedor_id,
      skuCodes: skuRows.map((r) => r.sku).filter(Boolean),
    });
  }

  await notifyFornecedorPedidoParaPostar({
    org_id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor,
  });

  notifySellerPedidoAtencao({
    org_id,
    seller_id: seller.id,
    pedido_id: pedido.id,
    tipo: "pedido_novo",
    motivo: `Novo pedido${referencia_externa ? ` ${referencia_externa}` : ""} de R$ ${blockResult.valor_total.toFixed(2)} recebido.`,
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

/** Tenta liberar pedido `pendente_estoque` quando o estoque e o saldo passam a ser suficientes. */
export async function tryPromotePendenteEstoquePedido(params: {
  org_id: string;
  pedido_id: string;
  seller: SubmitSellerErpPedidoInput["seller"];
}): Promise<SubmitSellerErpPedidoResult> {
  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, org_id, seller_id, fornecedor_id, status, valor_fornecedor, valor_dropcore, valor_total, referencia_externa, tracking_codigo, metodo_envio"
    )
    .eq("id", params.pedido_id)
    .eq("org_id", params.org_id)
    .maybeSingle();

  if (pedidoErr || !pedido) {
    return {
      ok: false,
      error_code: "PEDIDO_NAO_ENCONTRADO",
      error_message: "Pedido não encontrado.",
      http_status: 404,
    };
  }

  if (pedido.status !== "pendente_estoque") {
    return {
      ok: false,
      error_code: "STATUS_INVALIDO",
      error_message: `Pedido não está aguardando estoque (status: ${pedido.status}).`,
      http_status: 409,
    };
  }

  const { data: itens, error: itensErr } = await supabaseAdmin
    .from("pedido_itens")
    .select("quantidade, skus(id, sku, estoque_atual, estoque_minimo, nome_produto, custo_base, custo_dropcore, expedicao_override_linha)")
    .eq("pedido_id", pedido.id);

  if (itensErr || !itens?.length) {
    return {
      ok: false,
      error_code: "ITENS_INVALIDOS",
      error_message: "Pedido sem itens para liberar.",
      http_status: 422,
    };
  }

  const items: SubmitSellerErpPedidoItem[] = [];
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

  for (const row of itens) {
    const skusJoined = row.skus as unknown;
    const skuRaw = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
      | {
          id: string;
          sku: string;
          estoque_atual: unknown;
          estoque_minimo: unknown;
          nome_produto: string | null;
          custo_base: unknown;
          custo_dropcore: unknown;
          expedicao_override_linha?: string | null;
        }
      | null
      | undefined;
    if (!skuRaw?.sku) {
      return {
        ok: false,
        error_code: "SKU_NOT_FOUND",
        error_message: "Item do pedido sem SKU válido.",
        http_status: 404,
      };
    }
    const quantidade = Math.max(1, Number(row.quantidade ?? 1));
    const estoque = Number(skuRaw.estoque_atual ?? 0);
    if (estoque < quantidade) {
      return {
        ok: false,
        error_code: "ESTOQUE_INSUFICIENTE",
        error_message: `Estoque insuficiente para SKU ${skuRaw.sku}. Disponível: ${estoque}, solicitado: ${quantidade}`,
        http_status: 422,
      };
    }
    const custoBase = toNum(skuRaw.custo_base);
    items.push({ sku: skuRaw.sku, quantidade });
    skuRows.push({
      id: skuRaw.id,
      sku: skuRaw.sku,
      estoque_atual: estoque,
      estoque_minimo: skuRaw.estoque_minimo != null ? Number(skuRaw.estoque_minimo) : null,
      nome_produto: skuRaw.nome_produto ?? null,
      custo_base: custoBase,
      custo_dropcore: resolveTaxaDropcoreUnit(custoBase, skuRaw.custo_dropcore),
      expedicao_override_linha: skuRaw.expedicao_override_linha ?? null,
    });
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
      error_message: debitoEstoque.error_message ?? "Erro ao debitar estoque.",
      http_status: 422,
    };
  }

  const estoqueDebitos = debitoEstoque.debitos ?? [];
  const tryReverterEstoque = async (): Promise<void> => {
    if (estoqueDebitos.length === 0) return;
    await reverterEstoquePedido(estoqueDebitos);
  };

  const blockResult = await executeBlockSale({
    org_id: params.org_id,
    seller_id: pedido.seller_id,
    fornecedor_id: pedido.fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor: Number(pedido.valor_fornecedor ?? 0),
    valor_dropcore: Number(pedido.valor_dropcore ?? 0),
  });

  if (!blockResult.ok) {
    if (blockResult.code === "SALDO_INSUFICIENTE") {
      // Mantém o estoque debitado — mesma lógica do fluxo original (ver submitSellerErpPedido).
      await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
      notifySellerPedidoAtencao({
        org_id: params.org_id,
        seller_id: pedido.seller_id,
        pedido_id: pedido.id,
        tipo: "erro_saldo",
        motivo: `Saldo insuficiente para o pedido${pedido.referencia_externa ? ` ${pedido.referencia_externa}` : ""} (R$ ${blockResult.valor_total.toFixed(2)}). Saldo disponível: R$ ${blockResult.saldo_disponivel.toFixed(2)}. Recarregue seus créditos DropCore.`,
      });
      return {
        ok: false,
        error_code: "SALDO_INSUFICIENTE",
        error_message: "Saldo insuficiente para liberar o pedido.",
        http_status: 402,
      };
    }
    await tryReverterEstoque();
    return {
      ok: false,
      error_code: blockResult.code ?? "BLOCK_SALE_FAILED",
      error_message: "Erro ao bloquear saldo do pedido.",
      http_status: 500,
    };
  }

  await supabaseAdmin
    .from("pedidos")
    .update({
      status: "enviado",
      ledger_id: blockResult.ledger_id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedido.id);

  await addPedidoEvento({
    org_id: params.org_id,
    pedido_id: pedido.id,
    tipo: "pedido_liberado_estoque",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: "Estoque disponível — pedido liberado para postagem.",
    metadata: { referencia_externa: pedido.referencia_externa },
  });

  await notifyFornecedorPedidoParaPostar({
    org_id: params.org_id,
    fornecedor_id: pedido.fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor: Number(pedido.valor_fornecedor ?? 0),
  });

  return {
    ok: true,
    pedido_id: pedido.id,
    valor_total: blockResult.valor_total,
    status: "enviado",
    estoque_atual_por_sku: items.map((it, i) => ({
      sku: skuRows[i].sku,
      estoque_atual: skuRows[i].estoque_atual - it.quantidade,
    })),
  };
}

export type TryPromoteBloqueadoPedidoResult =
  | { ok: true; outcome: "enviado"; pedido_id: string; valor_total: number }
  | { ok: true; outcome: "pendente_estoque"; pedido_id: string }
  | { ok: false; outcome: "ainda_bloqueado"; pedido_id: string; motivo: string }
  | { ok: false; error_code: string; error_message: string };

/**
 * Reavalia um pedido `bloqueado` do zero (inadimplência, SKU habilitado no plano,
 * despacho/CD misto, valor) e promove pra `pendente_estoque` ou `enviado` se os motivos
 * já não se aplicam mais. Não recria o pedido (ele já existe como placeholder, criado
 * por insertPedidoPlaceholder) — só atualiza. Reusa os mesmos utilitários que
 * submitSellerErpPedido já usa no caminho de sucesso, pra não divergir da lógica original
 * (foi exatamente essa divergência — bloqueado nunca sendo reavaliado — que causou o bug
 * que motivou esta função).
 */
export async function tryPromoteBloqueadoPedido(params: {
  org_id: string;
  pedido_id: string;
}): Promise<TryPromoteBloqueadoPedidoResult> {
  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, org_id, seller_id, fornecedor_id, status, referencia_externa, tracking_codigo, metodo_envio, motivo_bloqueio, motivo_bloqueio_responsavel",
    )
    .eq("id", params.pedido_id)
    .eq("org_id", params.org_id)
    .maybeSingle();

  if (pedidoErr || !pedido) {
    return { ok: false, error_code: "PEDIDO_NAO_ENCONTRADO", error_message: "Pedido não encontrado." };
  }
  if (pedido.status !== "bloqueado") {
    return {
      ok: false,
      error_code: "STATUS_INVALIDO",
      error_message: `Pedido não está bloqueado (status: ${pedido.status}).`,
    };
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", pedido.seller_id)
    .maybeSingle();
  if (sellerErr || !sellerRow) {
    return { ok: false, error_code: "SELLER_NAO_ENCONTRADO", error_message: "Seller não encontrado." };
  }

  const fornecedor_id = pedido.fornecedor_id as string;

  const { data: itens, error: itensErr } = await supabaseAdmin
    .from("pedido_itens")
    .select(
      "quantidade, skus(id, sku, estoque_atual, estoque_minimo, nome_produto, custo_base, custo_dropcore, expedicao_override_linha)",
    )
    .eq("pedido_id", pedido.id);

  if (itensErr || !itens?.length) {
    return { ok: false, error_code: "ITENS_INVALIDOS", error_message: "Pedido sem itens para reavaliar." };
  }

  const items: SubmitSellerErpPedidoItem[] = [];
  const skuRows: SkuRowResolved[] = [];
  for (const row of itens) {
    const skusJoined = row.skus as unknown;
    const skuRaw = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
      | {
          id: string;
          sku: string;
          estoque_atual: unknown;
          estoque_minimo: unknown;
          nome_produto: string | null;
          custo_base: unknown;
          custo_dropcore: unknown;
          expedicao_override_linha?: string | null;
        }
      | null
      | undefined;
    if (!skuRaw?.sku) {
      return { ok: false, error_code: "SKU_NOT_FOUND", error_message: "Item do pedido sem SKU válido." };
    }
    const quantidade = Math.max(1, Number(row.quantidade ?? 1));
    const custoBase = toNum(skuRaw.custo_base);
    items.push({ sku: skuRaw.sku, quantidade });
    skuRows.push({
      id: skuRaw.id,
      sku: skuRaw.sku,
      estoque_atual: Number(skuRaw.estoque_atual ?? 0),
      estoque_minimo: skuRaw.estoque_minimo != null ? Number(skuRaw.estoque_minimo) : null,
      nome_produto: skuRaw.nome_produto ?? null,
      custo_base: custoBase,
      custo_dropcore: resolveTaxaDropcoreUnit(custoBase, skuRaw.custo_dropcore),
      expedicao_override_linha: skuRaw.expedicao_override_linha ?? null,
    });
  }

  let valor_fornecedor = 0;
  let valor_dropcore = 0;
  for (let i = 0; i < items.length; i++) {
    valor_fornecedor += skuRows[i].custo_base * items[i].quantidade;
    valor_dropcore += skuRows[i].custo_dropcore * items[i].quantidade;
  }
  const valor_total = valor_fornecedor + valor_dropcore;

  let bloqueio: { error_code: string; error_message: string; responsavel: PedidoBloqueioResponsavel } | null = null;

  const [sellerInad, fornInad] = await Promise.all([
    isInadimplente(supabaseAdmin, params.org_id, "seller", pedido.seller_id),
    isInadimplente(supabaseAdmin, params.org_id, "fornecedor", fornecedor_id),
  ]);
  if (sellerInad) {
    bloqueio = { error_code: "SELLER_INADIMPLENTE", error_message: "Seller inadimplente.", responsavel: "seller" };
  } else if (fornInad) {
    bloqueio = {
      error_code: "FORNECEDOR_INADIMPLENTE",
      error_message: "Fornecedor inadimplente.",
      responsavel: "fornecedor",
    };
  }

  if (!bloqueio && skuRows.length > 1) {
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
    const linhaDespacho = (row: SkuRowResolved) => {
      const ov = String(row.expedicao_override_linha ?? "").trim();
      return ov || expedicaoPadrao;
    };
    const chaves = new Set(skuRows.map((r) => linhaDespacho(r)));
    if (chaves.size > 1) {
      bloqueio = {
        error_code: "DESPACHO_CD_MISTO",
        error_message:
          "Este pedido mistura CDs ou endereços de despacho diferentes. Separe em envios distintos ou alinhe o despacho nos SKUs.",
        responsavel: "fornecedor",
      };
    }
  }

  if (!bloqueio && valor_total <= 0) {
    bloqueio = {
      error_code: "VALOR_INVALIDO",
      error_message: "Valor total do pedido deve ser positivo.",
      responsavel: "fornecedor",
    };
  }

  if (!bloqueio) {
    const vendaSkuCheck = await assertSellerPodeVenderSkus(supabaseAdmin, {
      sellerId: pedido.seller_id,
      sellerPlano: sellerRow.plano,
      skus: skuRows.map((r) => ({ id: r.id, sku: r.sku })),
    });
    if (!vendaSkuCheck.ok) {
      bloqueio = { error_code: "SKU_NAO_HABILITADO_PLANO", error_message: vendaSkuCheck.error, responsavel: "seller" };
    }
  }

  if (bloqueio) {
    const motivoMudou =
      bloqueio.error_message !== pedido.motivo_bloqueio || bloqueio.responsavel !== pedido.motivo_bloqueio_responsavel;
    if (motivoMudou) {
      await supabaseAdmin
        .from("pedidos")
        .update({
          motivo_bloqueio: bloqueio.error_message,
          motivo_bloqueio_responsavel: bloqueio.responsavel,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);
    }
    return { ok: false, outcome: "ainda_bloqueado", pedido_id: pedido.id, motivo: bloqueio.error_message };
  }

  let pendenteEstoque = false;
  for (let i = 0; i < items.length; i++) {
    if (skuRows[i].estoque_atual < items[i].quantidade) {
      pendenteEstoque = true;
      break;
    }
  }

  if (pendenteEstoque) {
    await supabaseAdmin
      .from("pedidos")
      .update({
        status: "pendente_estoque",
        motivo_bloqueio: null,
        motivo_bloqueio_responsavel: null,
        valor_fornecedor,
        valor_dropcore,
        valor_total,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", pedido.id);
    await addPedidoEvento({
      org_id: params.org_id,
      pedido_id: pedido.id,
      tipo: "pedido_pendente_estoque",
      origem: "sistema",
      actor_tipo: "sistema",
      descricao: "Motivo de bloqueio resolvido, mas estoque insuficiente — pedido aguardando reposição.",
      metadata: { referencia_externa: pedido.referencia_externa },
    });
    await Promise.all([
      notifyFornecedorPedidoParaPostar({
        org_id: params.org_id,
        fornecedor_id,
        pedido_id: pedido.id,
        valor_fornecedor,
        motivo: "estoque",
      }),
      notifySellerPedidoAtencao({
        org_id: params.org_id,
        seller_id: pedido.seller_id,
        pedido_id: pedido.id,
        tipo: "pedido_pendente_estoque",
        motivo: "Motivo de bloqueio resolvido, mas o estoque no DropCore está zerado. Aguardando reposição.",
      }),
    ]);
    return { ok: true, outcome: "pendente_estoque", pedido_id: pedido.id };
  }

  const debitoEstoque = await debitarEstoquePedido(
    items.map((item, i) => ({
      sku_id: skuRows[i].id,
      sku: skuRows[i].sku,
      quantidade: item.quantidade,
    })),
  );
  if (!debitoEstoque.ok) {
    return {
      ok: false,
      error_code: debitoEstoque.error_code ?? "ESTOQUE_DEBITO_FALHOU",
      error_message: debitoEstoque.error_message ?? "Erro ao debitar estoque.",
    };
  }

  const estoqueDebitos = debitoEstoque.debitos ?? [];
  const tryReverterEstoque = async (): Promise<void> => {
    if (estoqueDebitos.length === 0) return;
    const rev = await reverterEstoquePedido(estoqueDebitos);
    if (!rev.ok) {
      console.error("[tryPromoteBloqueadoPedido] estoque rollback:", rev.error_code, rev.error_message, rev.detalhes);
    }
  };

  const produtosAbaixoDoMin: { sku: string; nome?: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const novoEstoque = skuRows[i].estoque_atual - items[i].quantidade;
    if (skuRows[i].estoque_minimo != null && novoEstoque < skuRows[i].estoque_minimo!) {
      produtosAbaixoDoMin.push({ sku: skuRows[i].sku, nome: skuRows[i].nome_produto ?? undefined });
    }
  }
  if (produtosAbaixoDoMin.length > 0) {
    await notifyEstoqueBaixo({ org_id: params.org_id, fornecedor_id, produtos: produtosAbaixoDoMin });
  }

  const blockResult = await executeBlockSale({
    org_id: params.org_id,
    seller_id: pedido.seller_id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor,
    valor_dropcore,
  });

  if (!blockResult.ok) {
    if (blockResult.code === "SALDO_INSUFICIENTE") {
      // Mantém o estoque debitado — mesma lógica do fluxo original (ver submitSellerErpPedido).
      await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
      notifySellerPedidoAtencao({
        org_id: params.org_id,
        seller_id: pedido.seller_id,
        pedido_id: pedido.id,
        tipo: "erro_saldo",
        motivo: `Saldo insuficiente para o pedido${pedido.referencia_externa ? ` ${pedido.referencia_externa}` : ""} (R$ ${blockResult.valor_total.toFixed(2)}). Saldo disponível: R$ ${blockResult.saldo_disponivel.toFixed(2)}. Recarregue seus créditos DropCore.`,
      });
      return {
        ok: false,
        error_code: "SALDO_INSUFICIENTE",
        error_message: "Saldo insuficiente para liberar o pedido.",
      };
    }
    await tryReverterEstoque();
    return {
      ok: false,
      error_code: blockResult.code ?? "BLOCK_SALE_FAILED",
      error_message: "Erro ao bloquear saldo do pedido.",
    };
  }

  await supabaseAdmin
    .from("pedidos")
    .update({
      status: "enviado",
      motivo_bloqueio: null,
      motivo_bloqueio_responsavel: null,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      ledger_id: blockResult.ledger_id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedido.id);

  await addPedidoEvento({
    org_id: params.org_id,
    pedido_id: pedido.id,
    tipo: "pedido_liberado_bloqueio",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: "Motivo de bloqueio resolvido — pedido liberado para postagem.",
    metadata: { referencia_externa: pedido.referencia_externa },
  });

  fireErpEstoqueWebhook({
    webhookUrl: sellerRow.erp_estoque_webhook_url,
    webhookSecret: sellerRow.erp_estoque_webhook_secret,
    payload: {
      event: "dropcore.estoque_atualizado",
      pedido_id: pedido.id,
      referencia_externa: pedido.referencia_externa,
      seller_id: pedido.seller_id,
      org_id: params.org_id,
      items: items.map((it, i) => ({
        sku: skuRows[i].sku,
        quantidade_vendida: it.quantidade,
        estoque_atual_dropcore: skuRows[i].estoque_atual - it.quantidade,
      })),
    },
  });

  if (fornecedor_id) {
    dispararSyncEstoqueOlistFornecedorSkus({
      orgId: params.org_id,
      fornecedorId: fornecedor_id,
      skuCodes: skuRows.map((r) => r.sku).filter(Boolean),
    });
  }

  await notifyFornecedorPedidoParaPostar({
    org_id: params.org_id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor,
  });

  return { ok: true, outcome: "enviado", pedido_id: pedido.id, valor_total: blockResult.valor_total };
}

export type TryPromoteErroSaldoPedidoResult =
  | { ok: true; outcome: "enviado"; pedido_id: string; valor_total: number }
  | { ok: true; outcome: "ainda_erro_saldo"; pedido_id: string; saldo_disponivel: number; valor_total: number }
  | { ok: false; error_code: string; error_message: string };

/**
 * Reavalia um pedido `erro_saldo` tentando bloquear o saldo de novo. Não redebita
 * estoque: diferente de `bloqueado`/`pendente_estoque`, aqui o estoque já foi debitado
 * na tentativa original (é venda confirmada) e nunca foi revertido de propósito — ver o
 * comentário no branch SALDO_INSUFICIENTE de `submitSellerErpPedido`. Se o saldo continuar
 * insuficiente, o pedido permanece `erro_saldo` sem mexer no estoque.
 */
export async function tryPromoteErroSaldoPedido(params: {
  org_id: string;
  pedido_id: string;
}): Promise<TryPromoteErroSaldoPedidoResult> {
  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select(
      "id, org_id, seller_id, fornecedor_id, status, valor_fornecedor, valor_dropcore, valor_total, referencia_externa",
    )
    .eq("id", params.pedido_id)
    .eq("org_id", params.org_id)
    .maybeSingle();

  if (pedidoErr || !pedido) {
    return { ok: false, error_code: "PEDIDO_NAO_ENCONTRADO", error_message: "Pedido não encontrado." };
  }
  if (pedido.status !== "erro_saldo") {
    return {
      ok: false,
      error_code: "STATUS_INVALIDO",
      error_message: `Pedido não está em erro_saldo (status: ${pedido.status}).`,
    };
  }

  const fornecedor_id = pedido.fornecedor_id as string;

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", pedido.seller_id)
    .maybeSingle();
  if (sellerErr || !sellerRow) {
    return { ok: false, error_code: "SELLER_NAO_ENCONTRADO", error_message: "Seller não encontrado." };
  }

  const blockResult = await executeBlockSale({
    org_id: params.org_id,
    seller_id: pedido.seller_id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor: Number(pedido.valor_fornecedor ?? 0),
    valor_dropcore: Number(pedido.valor_dropcore ?? 0),
  });

  if (!blockResult.ok) {
    if (blockResult.code === "SALDO_INSUFICIENTE") {
      return {
        ok: true,
        outcome: "ainda_erro_saldo",
        pedido_id: pedido.id,
        saldo_disponivel: blockResult.saldo_disponivel,
        valor_total: blockResult.valor_total,
      };
    }
    return {
      ok: false,
      error_code: blockResult.code ?? "BLOCK_SALE_FAILED",
      error_message: "Erro ao bloquear saldo do pedido.",
    };
  }

  await supabaseAdmin
    .from("pedidos")
    .update({ status: "enviado", ledger_id: blockResult.ledger_id, atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id);

  await addPedidoEvento({
    org_id: params.org_id,
    pedido_id: pedido.id,
    tipo: "pedido_liberado_saldo",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: "Saldo do seller resolvido — pedido liberado para postagem.",
    metadata: { referencia_externa: pedido.referencia_externa },
  });

  const { data: itens } = await supabaseAdmin
    .from("pedido_itens")
    .select("quantidade, skus(sku, estoque_atual)")
    .eq("pedido_id", pedido.id);

  const skuItems = (itens ?? []).map((row) => {
    const skusJoined = row.skus as unknown;
    const skuRaw = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
      | { sku: string; estoque_atual: unknown }
      | null
      | undefined;
    return {
      sku: skuRaw?.sku ?? "",
      quantidade: Math.max(1, Number(row.quantidade ?? 1)),
      estoque_atual: Number(skuRaw?.estoque_atual ?? 0),
    };
  });

  fireErpEstoqueWebhook({
    webhookUrl: sellerRow.erp_estoque_webhook_url,
    webhookSecret: sellerRow.erp_estoque_webhook_secret,
    payload: {
      event: "dropcore.estoque_atualizado",
      pedido_id: pedido.id,
      referencia_externa: pedido.referencia_externa,
      seller_id: pedido.seller_id,
      org_id: params.org_id,
      items: skuItems.map((it) => ({
        sku: it.sku,
        quantidade_vendida: it.quantidade,
        estoque_atual_dropcore: it.estoque_atual,
      })),
    },
  });

  if (fornecedor_id) {
    dispararSyncEstoqueOlistFornecedorSkus({
      orgId: params.org_id,
      fornecedorId: fornecedor_id,
      skuCodes: skuItems.map((r) => r.sku).filter(Boolean),
    });
  }

  await notifyFornecedorPedidoParaPostar({
    org_id: params.org_id,
    fornecedor_id,
    pedido_id: pedido.id,
    valor_fornecedor: Number(pedido.valor_fornecedor ?? 0),
  });

  return { ok: true, outcome: "enviado", pedido_id: pedido.id, valor_total: blockResult.valor_total };
}
