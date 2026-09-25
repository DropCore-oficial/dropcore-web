/**
 * Núcleo compartilhado de ingestão de um pedido do Mercado Livre pro DropCore — usado
 * pelo webhook (tempo real) e pelo cron de reconciliação (rede de segurança, pega o que
 * o webhook perder). Mesma lógica nos dois, pra não divergir.
 *
 * Exclusivo com Olist: se o seller tiver os dois conectados, ignora (ver guards em
 * /api/seller/olist e /api/seller/mercadolivre/oauth — aqui é a segunda camada de defesa).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getValidMercadoLivreAccessToken } from "@/lib/mercadoLivreApiClient";
import { submitSellerErpPedido, insertPedidoPlaceholder } from "@/lib/erp/submitSellerErpPedido";
import { calcularPrazoDespachoPedido } from "@/lib/pedidoSlaDespacho";
import { notifySellerAnuncioSemSku } from "@/lib/notifySellerAnuncioSemSku";

type MlOrderDetalhe = {
  order_items?: Array<{
    item?: { seller_sku?: string | null; title?: string | null };
    quantity?: number;
  }>;
  buyer?: { nickname?: string | null };
  total_amount?: number;
  paid_amount?: number;
  /** Comprador que leva >1 unidade num único checkout pode gerar vários order_id
   * separados com o mesmo pack_id — 1 pacote, 1 etiqueta só (confirmado ao vivo
   * 2026-09-23). Repassado pro DropCore só pra permitir agrupar na exibição (ver
   * pedidos.marketplace_pack_id em docs/SCHEMA.md) — não muda nada no processamento
   * deste pedido em si. */
  pack_id?: number | string | null;
};

export type IngerirPedidoMlResultado =
  | {
      ok: true;
      status:
        | "novo"
        | "duplicado"
        | "bloqueado"
        | "pendente_estoque"
        | "produto_nao_vinculado"
        | "anuncio_sem_sku"
        | "ignorado_olist_ativo";
    }
  | { ok: false; retryable: boolean; motivo: string };

async function fetchOrder(
  orderId: string,
  accessToken: string
): Promise<{ ok: true; order: MlOrderDetalhe } | { ok: false; retryable: boolean; status: number }> {
  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.ok) return { ok: true, order: (await res.json()) as MlOrderDetalhe };
  // 404/403 = pedido não existe ou sem permissão pra esse token — repetir não muda nada.
  // Qualquer outro status (429, 5xx, etc.) é instabilidade da API do ML — vale repetir.
  const retryable = res.status !== 404 && res.status !== 403;
  return { ok: false, retryable, status: res.status };
}

export async function ingerirPedidoMercadoLivrePorSeller(params: {
  sellerId: string;
  orderId: string;
}): Promise<IngerirPedidoMlResultado> {
  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", params.sellerId)
    .maybeSingle();
  if (sellerErr) return { ok: false, retryable: true, motivo: `Falha ao buscar seller: ${sellerErr.message}` };
  if (!sellerRow?.fornecedor_id) return { ok: false, retryable: false, motivo: "Seller sem fornecedor vinculado." };

  const { data: olistRow } = await supabaseAdmin
    .from("seller_olist_integrations")
    .select("olist_token_ciphertext")
    .eq("seller_id", sellerRow.id)
    .maybeSingle();
  if (olistRow?.olist_token_ciphertext) {
    console.warn(
      `[mercadoLivrePedidoIngest] seller ${sellerRow.id} tem Olist ativo — ignorando pedido ${params.orderId} pra não duplicar.`
    );
    return { ok: true, status: "ignorado_olist_ativo" };
  }

  const ctx = await getValidMercadoLivreAccessToken(sellerRow.id);
  if (!ctx) return { ok: false, retryable: true, motivo: "Sem token válido do Mercado Livre." };

  const orderRes = await fetchOrder(params.orderId, ctx.accessToken);
  if (!orderRes.ok) {
    return {
      ok: false,
      retryable: orderRes.retryable,
      motivo: `Falha ao buscar pedido ${params.orderId} na API do ML (status ${orderRes.status}).`,
    };
  }

  const items = (orderRes.order.order_items ?? [])
    .map((oi) => ({ sku: oi.item?.seller_sku ?? null, quantidade: Number(oi.quantity ?? 1) }))
    .filter((it): it is { sku: string; quantidade: number } => !!it.sku);

  if (items.length === 0) {
    // Anúncio ainda não tem o SKU do DropCore cadastrado na variação vendida — grava
    // placeholder visível pro seller em vez de descartar (mesmo raciocínio do
    // produto_nao_vinculado: sem isso a venda some sem ninguém saber, ver "incidente
    // Galileus" em submitSellerErpPedido.ts). O cron dedicado de retry
    // (anuncioSemSkuRetry.ts) tenta promover automaticamente quando o SKU for cadastrado.
    const titulo = orderRes.order.order_items?.[0]?.item?.title?.trim();
    const nomeProduto = titulo || `Produto do Mercado Livre (pedido ${params.orderId})`;
    const slaPrazoDespacho = await calcularPrazoDespachoPedido({
      canalVenda: "mercado_livre",
      etiquetaImpressaEm: null,
      sellerId: sellerRow.id,
      marketplaceNumero: params.orderId,
    }).catch(() => null);

    const motivoSeller = `O anúncio "${nomeProduto}" não tem nenhum SKU do DropCore cadastrado nessa variação. Essa venda não gera saldo nem etiqueta automática — cadastre o SKU certo no anúncio pra ela entrar automaticamente.`;

    const placeholderResult = await insertPedidoPlaceholder({
      org_id: sellerRow.org_id,
      seller_id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      referencia_externa: `ml:${params.orderId}`,
      tracking_codigo: null,
      metodo_envio: null,
      meta: {
        nome_produto: nomeProduto,
        marketplace_numero: params.orderId,
        comprador_nome: orderRes.order.buyer?.nickname ?? null,
        canal_venda: "mercado_livre",
        preco_venda: Number(orderRes.order.total_amount ?? orderRes.order.paid_amount ?? 0) || null,
        marketplace_pack_id: orderRes.order.pack_id != null ? String(orderRes.order.pack_id) : null,
      },
      valor_fornecedor: 0,
      valor_dropcore: 0,
      valor_total: 0,
      items: [],
      skuRows: [],
      status: "anuncio_sem_sku",
      motivo_bloqueio: motivoSeller,
      motivo_bloqueio_responsavel: "seller",
      sla_prazo_despacho: slaPrazoDespacho ? slaPrazoDespacho.toISOString() : null,
      evento: {
        tipo: "anuncio_sem_sku",
        descricao: `Pedido do Mercado Livre sem SKU cadastrado no anúncio (order ${params.orderId}).`,
      },
      notify: (pedido_id) =>
        notifySellerAnuncioSemSku({
          org_id: sellerRow.org_id,
          seller_id: sellerRow.id,
          pedido_id,
          nome_produto: nomeProduto,
          sla_prazo_despacho: slaPrazoDespacho ? slaPrazoDespacho.toISOString() : null,
          urgente: false,
        }),
    });

    if (placeholderResult.ok) return { ok: true, status: "anuncio_sem_sku" };
    if (placeholderResult.error_code === "PEDIDO_DUPLICADO") return { ok: true, status: "duplicado" };
    return {
      ok: false,
      retryable: placeholderResult.error_code === "INTERNAL_ERROR",
      motivo: placeholderResult.error_message,
    };
  }

  const result = await submitSellerErpPedido({
    org_id: sellerRow.org_id,
    seller: {
      id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      plano: sellerRow.plano,
      erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
      erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
    },
    referencia_externa: `ml:${params.orderId}`,
    items,
    meta: {
      marketplace_numero: params.orderId,
      comprador_nome: orderRes.order.buyer?.nickname ?? null,
      canal_venda: "mercado_livre",
      preco_venda: Number(orderRes.order.total_amount ?? orderRes.order.paid_amount ?? 0) || null,
      marketplace_pack_id: orderRes.order.pack_id != null ? String(orderRes.order.pack_id) : null,
    },
  });

  if (result.ok) {
    const status =
      result.status === "bloqueado" || result.status === "pendente_estoque" || result.status === "produto_nao_vinculado"
        ? result.status
        : "novo";
    return { ok: true, status };
  }
  if (result.error_code === "PEDIDO_DUPLICADO") return { ok: true, status: "duplicado" };

  // INTERNAL_ERROR pode ser hiccup passageiro de banco — vale repetir. O resto (SKU
  // inexistente, valor inválido, etc.) é problema de dado que não muda tentando de novo.
  return { ok: false, retryable: result.error_code === "INTERNAL_ERROR", motivo: result.error_message };
}

/** Só confere se o pedido já tem `seller_sku` em algum item, sem submeter nada — usado
 * pelo cron de retry pra decidir se vale a pena tentar promover um `anuncio_sem_sku`
 * (evita apagar/recriar o placeholder, e notificar o seller de novo, sem necessidade). */
export async function mercadoLivreOrderTemSellerSku(params: {
  sellerId: string;
  orderId: string;
}): Promise<{ ok: true; temSku: boolean } | { ok: false; retryable: boolean; motivo: string }> {
  const ctx = await getValidMercadoLivreAccessToken(params.sellerId);
  if (!ctx) return { ok: false, retryable: true, motivo: "Sem token válido do Mercado Livre." };

  const orderRes = await fetchOrder(params.orderId, ctx.accessToken);
  if (!orderRes.ok) {
    return {
      ok: false,
      retryable: orderRes.retryable,
      motivo: `Falha ao buscar pedido ${params.orderId} na API do ML (status ${orderRes.status}).`,
    };
  }

  const temSku = (orderRes.order.order_items ?? []).some((oi) => !!oi.item?.seller_sku);
  return { ok: true, temSku };
}

export type TryPromoteAnuncioSemSkuPedidoResult =
  | { ok: true; outcome: "promovido"; pedido_id: string; novo_status: string }
  | { ok: true; outcome: "ainda_sem_sku"; pedido_id: string }
  | { ok: false; error_code: string; error_message: string };

/**
 * Reavalia um pedido `anuncio_sem_sku`: confere se o anúncio já tem SKU cadastrado e, se
 * sim, apaga o placeholder (cascade em pedido_itens/pedido_eventos) e reingere do zero —
 * reusa 100% do pipeline real (`ingerirPedidoMercadoLivrePorSeller`/`submitSellerErpPedido`)
 * em vez de duplicar a resolução de item→SKU→estoque→saldo aqui. Se ainda não tiver SKU,
 * não toca em nada (o placeholder original continua intacto).
 */
export async function tryPromoteAnuncioSemSkuPedido(params: {
  pedido_id: string;
}): Promise<TryPromoteAnuncioSemSkuPedidoResult> {
  const { data: pedido, error: pedidoErr } = await supabaseAdmin
    .from("pedidos")
    .select("id, seller_id, status, referencia_externa")
    .eq("id", params.pedido_id)
    .maybeSingle();

  if (pedidoErr || !pedido) {
    return { ok: false, error_code: "PEDIDO_NAO_ENCONTRADO", error_message: "Pedido não encontrado." };
  }
  if (pedido.status !== "anuncio_sem_sku") {
    return { ok: false, error_code: "STATUS_INVALIDO", error_message: `Pedido não está anuncio_sem_sku (status: ${pedido.status}).` };
  }

  const orderId = (pedido.referencia_externa ?? "").startsWith("ml:") ? pedido.referencia_externa!.slice(3) : null;
  if (!orderId) {
    return { ok: false, error_code: "REFERENCIA_INVALIDA", error_message: "referencia_externa não é um pedido do Mercado Livre." };
  }

  const peek = await mercadoLivreOrderTemSellerSku({ sellerId: pedido.seller_id, orderId });
  if (!peek.ok) {
    return { ok: false, error_code: "PEEK_FALHOU", error_message: peek.motivo };
  }
  if (!peek.temSku) {
    return { ok: true, outcome: "ainda_sem_sku", pedido_id: pedido.id };
  }

  const { error: deleteErr } = await supabaseAdmin.from("pedidos").delete().eq("id", pedido.id);
  if (deleteErr) {
    return { ok: false, error_code: "DELETE_FALHOU", error_message: deleteErr.message };
  }

  const reingest = await ingerirPedidoMercadoLivrePorSeller({ sellerId: pedido.seller_id, orderId });
  if (!reingest.ok) {
    return { ok: false, error_code: "REINGEST_FALHOU", error_message: reingest.motivo };
  }

  return { ok: true, outcome: "promovido", pedido_id: pedido.id, novo_status: reingest.status };
}
