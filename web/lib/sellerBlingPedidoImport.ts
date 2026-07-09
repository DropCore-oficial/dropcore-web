import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";
import { obterPedidoVendaBling, type BlingPedidoVendaDetalhe } from "@/lib/blingOrdersApi";
import { getSellerBlingAccessToken } from "@/lib/sellerBlingIntegration";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Versão simplificada em relação ao equivalente Olist (sellerOlistPedidoImport.ts):
 * não replica o pré-estágio de "reserva de estoque" para pedidos em aberto nem a
 * máquina de estados de situação (que na Bling é configurável por conta, não um
 * enum fixo — ver comentário em blingOrdersApi.ts). Pedido sem estoque suficiente
 * já cai em "pendente_estoque" via submitSellerErpPedido, então não fica quebrado,
 * só não tem o mesmo refinamento de reserva antecipada da Olist ainda.
 */

function buildReferenciaExterna(pedidoId: number): string {
  return `bling:${pedidoId}`;
}

function mapPedidoItems(pedido: BlingPedidoVendaDetalhe) {
  return pedido.itens
    .map((item) => ({
      sku: item.codigo?.trim() ?? "",
      quantidade: Math.max(1, Math.floor(item.quantidade ?? 1)),
    }))
    .filter((item) => item.sku);
}

export type ProcessBlingPedidoImportInput = {
  org_id: string;
  seller_id: string;
  bling_pedido_id: number;
  /** "order.deleted" (ou equivalente) — tenta cancelar em vez de importar. */
  is_delete_event?: boolean;
};

export type ProcessBlingPedidoImportResult =
  | { ok: true; outcome: "imported" | "imported_pendente_estoque" | "imported_bloqueado"; pedido_id_dropcore: string }
  | { ok: true; outcome: "skipped_duplicate"; pedido_id_dropcore?: string }
  | { ok: true; outcome: "skipped_sem_itens" }
  | { ok: true; outcome: "cancelado"; pedido_id_dropcore: string }
  | { ok: true; outcome: "skipped_nao_encontrado_para_cancelar" }
  | { ok: false; error: string };

/**
 * Importa (ou cancela) um pedido de venda do Bling no DropCore, disparado pelo
 * webhook. Idempotente por `bling:{id}`. Chamado de forma fire-and-forget pelo
 * webhook (não bloqueia a resposta HTTP) e, futuramente, pelo cron de segurança
 * (web/app/api/cron/bling-sync).
 */
export async function processBlingPedidoImport(
  input: ProcessBlingPedidoImportInput,
): Promise<ProcessBlingPedidoImportResult> {
  const referencia = buildReferenciaExterna(input.bling_pedido_id);

  if (input.is_delete_event) {
    const { data: existente, error: findErr } = await supabaseAdmin
      .from("pedidos")
      .select("id, status")
      .eq("org_id", input.org_id)
      .eq("seller_id", input.seller_id)
      .eq("referencia_externa", referencia)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findErr || !existente) {
      return { ok: true, outcome: "skipped_nao_encontrado_para_cancelar" };
    }
    if (["enviado", "aguardando_repasse", "entregue", "devolvido"].includes(existente.status)) {
      // já saiu pra postagem — não cancela automaticamente, precisa de ação manual
      return { ok: true, outcome: "skipped_nao_encontrado_para_cancelar" };
    }
    await supabaseAdmin
      .from("pedidos")
      .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
      .eq("id", existente.id);
    return { ok: true, outcome: "cancelado", pedido_id_dropcore: existente.id };
  }

  const accessToken = await getSellerBlingAccessToken(input.seller_id);
  if (!accessToken) {
    return { ok: false, error: "Token de acesso Bling indisponível ou expirado para este seller." };
  }

  let pedidoBling: BlingPedidoVendaDetalhe;
  try {
    pedidoBling = await obterPedidoVendaBling(accessToken, input.bling_pedido_id);
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao obter pedido no Bling." };
  }

  const items = mapPedidoItems(pedidoBling);
  if (items.length === 0) {
    return { ok: true, outcome: "skipped_sem_itens" };
  }

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", input.seller_id)
    .eq("org_id", input.org_id)
    .maybeSingle();

  if (sellerErr || !sellerRow) {
    return { ok: false, error: "Seller não encontrado." };
  }
  if (!sellerRow.fornecedor_id) {
    return { ok: false, error: "Seller não está vinculado a um fornecedor." };
  }

  const rastreio = pedidoBling.transporte?.volumes?.find((v) => v.codigoRastreamento)?.codigoRastreamento ?? null;

  const result = await submitSellerErpPedido({
    org_id: input.org_id,
    seller: {
      id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      plano: sellerRow.plano,
      erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
      erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
    },
    referencia_externa: referencia,
    tracking_codigo: rastreio,
    metodo_envio: pedidoBling.transporte?.volumes?.find((v) => v.servico)?.servico ?? null,
    items,
    meta: {
      marketplace_numero: pedidoBling.numero != null ? String(pedidoBling.numero) : null,
      comprador_nome: pedidoBling.contato?.nome ?? null,
      comprador_cidade: pedidoBling.transporte?.contato?.municipio ?? null,
      comprador_uf: pedidoBling.transporte?.contato?.uf ?? null,
      comprador_fone: pedidoBling.contato?.telefone ?? pedidoBling.contato?.celular ?? null,
    },
  });

  if (!result.ok) {
    if (result.error_code === "PEDIDO_DUPLICADO") {
      return { ok: true, outcome: "skipped_duplicate", pedido_id_dropcore: result.pedido_existente?.pedido_id };
    }
    return { ok: false, error: result.error_message };
  }

  const outcome =
    result.status === "bloqueado"
      ? "imported_bloqueado"
      : result.status === "pendente_estoque"
        ? "imported_pendente_estoque"
        : "imported";

  return { ok: true, outcome, pedido_id_dropcore: result.pedido_id };
}
