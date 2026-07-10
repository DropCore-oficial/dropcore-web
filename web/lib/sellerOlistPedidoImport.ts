import {
  submitSellerErpPedido,
  tryPromoteBloqueadoPedido,
  tryPromotePendenteEstoquePedido,
} from "@/lib/erp/submitSellerErpPedido";
import {
  fetchUrlAsPdfBase64,
  obterExpedicaoPorPedidoVenda,
  obterLinksEtiquetasImpressaoOlist,
  obterPedidoOlist,
  type OlistPedidoDetalhe,
} from "@/lib/olistTinyApi";
import {
  isCodigoSituacaoCancelado,
  isCodigoSituacaoEmAberto,
  isSituacaoTextoCancelada,
  isSituacaoTextoEmAberto,
  shouldImportCodigoSituacao,
  shouldImportSituacaoText,
} from "@/lib/olistPedidoImportPolicy";
import { liberarReservaPorReferencia, processOlistPedidoReserva } from "@/lib/order/pedidoReservaOlist";
import { decryptSellerErpSecret, describeSellerErpSecretDecryptFailure } from "@/lib/sellerErpSecretBox";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const OLIST_API_PAUSE_MS = 200;

function buildReferenciaExterna(pedidoId: number): string {
  return `olist:${pedidoId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapPedidoItems(pedido: OlistPedidoDetalhe) {
  return pedido.itens
    .map((item) => ({
      sku: item.codigo?.trim() ?? "",
      quantidade: item.quantidade,
    }))
    .filter((item) => item.sku);
}

/** Sucesso = retorna array vazio (convenção usada pelos call-sites deste arquivo e pelo cron de retry). */
export async function tryAttachOlistEtiquetaPdf(params: {
  org_id: string;
  pedido_id: string;
  olist_pedido_id: number;
  token: string;
}): Promise<string[]> {
  const warnings: string[] = [];
  let exp: { id: number; idAgrupamento?: number } | null = null;
  try {
    exp = await obterExpedicaoPorPedidoVenda(params.token, params.olist_pedido_id);
    await sleep(OLIST_API_PAUSE_MS);
  } catch {
    exp = null;
  }
  if (!exp) {
    warnings.push(
      "Etiqueta PDF: sem expedição na Olist para este pedido ainda. Quando a Olist gerar expedição/etiqueta (ex.: marketplace), reimporte ou aguarde próximo sync/webhook para anexar automaticamente.",
    );
    return warnings;
  }

  let links: string[] = [];
  try {
    links = await obterLinksEtiquetasImpressaoOlist(params.token, {
      idExpedicao: exp.id,
      idAgrupamento: exp.idAgrupamento,
    });
    await sleep(OLIST_API_PAUSE_MS);
  } catch (e: unknown) {
    warnings.push(
      `Etiqueta PDF: Olist não retornou link de impressão (${e instanceof Error ? e.message : "erro"}).`,
    );
    return warnings;
  }

  if (links.length === 0) {
    warnings.push("Etiqueta PDF: Olist não retornou links de impressão para esta expedição.");
    return warnings;
  }

  for (const url of links) {
    const b64 = await fetchUrlAsPdfBase64(url);
    if (!b64) continue;
    const { error } = await supabaseAdmin
      .from("pedidos")
      .update({
        etiqueta_pdf_base64: b64,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", params.pedido_id)
      .eq("org_id", params.org_id);
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (msg.includes("etiqueta_pdf") || error.code === "42703") {
        warnings.push("Etiqueta PDF: colunas de etiqueta não existem no banco (rode add-etiqueta-erp-to-pedidos.sql).");
      } else {
        warnings.push(`Etiqueta PDF: falha ao gravar no DropCore (${error.message}).`);
      }
      return warnings;
    }
    return warnings;
  }

  warnings.push("Etiqueta PDF: links da Olist não retornaram PDF válido para download.");
  return warnings;
}

export type ProcessOlistPedidoImportInput = {
  org_id: string;
  seller_id: string;
  olist_token_ciphertext: string;
  olist_pedido_id: number;
  /** Se vier do webhook, filtra antes de chamar a API (codigoSituacao). */
  codigo_situacao_webhook?: string | null;
};

export type ProcessOlistPedidoImportResult =
  | { ok: true; outcome: "imported"; pedido_id_dropcore: string; warnings: string[] }
  | { ok: true; outcome: "imported_pendente_estoque"; pedido_id_dropcore: string; warnings: string[] }
  | { ok: true; outcome: "imported_bloqueado"; pedido_id_dropcore: string; warnings: string[] }
  | { ok: true; outcome: "promoted_pendente_estoque"; pedido_id_dropcore: string; warnings: string[] }
  | { ok: true; outcome: "promoted_bloqueado"; pedido_id_dropcore: string; warnings: string[] }
  | { ok: true; outcome: "skipped_duplicate"; pedido_id_dropcore?: string; warnings?: string[] }
  | { ok: true; outcome: "skipped_situacao" }
  | { ok: true; outcome: "skipped_sem_itens"; warnings: string[] }
  | { ok: true; outcome: "reservado_estoque"; warnings: string[] }
  | { ok: false; error: string };

/**
 * Importa um único pedido Olist/Tiny para o hub (idempotência `olist:{id}`).
 * Usado pelo cron de sync e pelo webhook de pedidos.
 */
export async function processOlistPedidoImport(
  input: ProcessOlistPedidoImportInput
): Promise<ProcessOlistPedidoImportResult> {
  let token: string;
  try {
    token = decryptSellerErpSecret(input.olist_token_ciphertext);
  } catch (e: unknown) {
    return { ok: false, error: describeSellerErpSecretDecryptFailure(e) };
  }

  const codigo = input.codigo_situacao_webhook?.trim() ?? "";
  if (
    codigo &&
    !shouldImportCodigoSituacao(codigo) &&
    !isCodigoSituacaoEmAberto(codigo) &&
    !isCodigoSituacaoCancelado(codigo)
  ) {
    return { ok: true, outcome: "skipped_situacao" };
  }

  let pedido: OlistPedidoDetalhe;
  try {
    pedido = await obterPedidoOlist(token, input.olist_pedido_id);
    await sleep(OLIST_API_PAUSE_MS);
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erro ao obter pedido na Olist/Tiny.",
    };
  }

  const items = mapPedidoItems(pedido);
  if (items.length === 0) {
    return {
      ok: true,
      outcome: "skipped_sem_itens",
      warnings: [`Pedido ${pedido.id}: sem itens com SKU mapeável.`],
    };
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

  const referencia = buildReferenciaExterna(pedido.id);

  if (isSituacaoTextoEmAberto(pedido.situacao)) {
    const reserva = await processOlistPedidoReserva({
      org_id: input.org_id,
      seller_id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      referencia_externa: referencia,
      items,
    });
    if (!reserva.ok) {
      return { ok: false, error: reserva.error };
    }
    return { ok: true, outcome: "reservado_estoque", warnings: reserva.warnings };
  }

  if (isSituacaoTextoCancelada(pedido.situacao)) {
    const liberar = await liberarReservaPorReferencia({
      org_id: input.org_id,
      seller_id: sellerRow.id,
      referencia_externa: referencia,
      novoStatus: "cancelada",
    });
    if (!liberar.ok) {
      console.error("[processOlistPedidoImport] liberar reserva (cancelado):", liberar.warnings);
    }
    return { ok: true, outcome: "skipped_situacao" };
  }

  if (!shouldImportSituacaoText(pedido.situacao)) {
    return { ok: true, outcome: "skipped_situacao" };
  }

  const liberarAntesSubmit = await liberarReservaPorReferencia({
    org_id: input.org_id,
    seller_id: sellerRow.id,
    referencia_externa: referencia,
    novoStatus: "liberada",
  });
  if (!liberarAntesSubmit.ok) {
    console.error("[processOlistPedidoImport] liberar reserva (aprovado):", liberarAntesSubmit.warnings);
  }

  const nomeProduto =
    pedido.itens.map((i) => i.descricao?.trim()).find(Boolean) ??
    items.map((i) => i.sku).join(", ");
  const submit = await submitSellerErpPedido({
    org_id: input.org_id,
    seller: {
      id: sellerRow.id,
      fornecedor_id: sellerRow.fornecedor_id,
      plano: sellerRow.plano,
      erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
      erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
    },
    referencia_externa: referencia,
    tracking_codigo: pedido.codigo_rastreamento,
    metodo_envio: pedido.forma_envio,
    items: items.map((item) => ({ sku: item.sku, quantidade: item.quantidade })),
    meta: {
      nome_produto: nomeProduto,
      marketplace_numero: pedido.numero_ecommerce,
      comprador_nome: pedido.comprador_nome,
      comprador_cidade: pedido.comprador_cidade,
      comprador_uf: pedido.comprador_uf,
      comprador_fone: pedido.comprador_fone,
    },
  });

  if (!submit.ok) {
    if (submit.error_code === "PEDIDO_DUPLICADO") {
      let pedidoIdDup = submit.pedido_existente?.pedido_id ?? null;
      let dupStatus = submit.pedido_existente?.status ?? null;
      if (!pedidoIdDup) {
        const ref = buildReferenciaExterna(pedido.id);
        const { data: rowDup, error: rowDupErr } = await supabaseAdmin
          .from("pedidos")
          .select("id, status")
          .eq("org_id", input.org_id)
          .eq("seller_id", input.seller_id)
          .eq("referencia_externa", ref)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!rowDupErr && rowDup?.id) {
          pedidoIdDup = rowDup.id;
          dupStatus = rowDup.status ?? dupStatus;
        }
      }
      if (pedidoIdDup && dupStatus === "pendente_estoque") {
        const promote = await tryPromotePendenteEstoquePedido({
          org_id: input.org_id,
          pedido_id: pedidoIdDup,
          seller: {
            id: sellerRow.id,
            fornecedor_id: sellerRow.fornecedor_id,
            plano: sellerRow.plano,
            erp_estoque_webhook_url: sellerRow.erp_estoque_webhook_url,
            erp_estoque_webhook_secret: sellerRow.erp_estoque_webhook_secret,
          },
        });
        if (promote.ok) {
          const labelWarnings = await tryAttachOlistEtiquetaPdf({
            org_id: input.org_id,
            pedido_id: promote.pedido_id,
            olist_pedido_id: pedido.id,
            token,
          });
          return {
            ok: true,
            outcome: "promoted_pendente_estoque",
            pedido_id_dropcore: promote.pedido_id,
            warnings: labelWarnings,
          };
        }
      }
      if (pedidoIdDup && dupStatus === "bloqueado") {
        const promote = await tryPromoteBloqueadoPedido({ org_id: input.org_id, pedido_id: pedidoIdDup });
        if (promote.ok && promote.outcome === "enviado") {
          const labelWarnings = await tryAttachOlistEtiquetaPdf({
            org_id: input.org_id,
            pedido_id: promote.pedido_id,
            olist_pedido_id: pedido.id,
            token,
          });
          return {
            ok: true,
            outcome: "promoted_bloqueado",
            pedido_id_dropcore: promote.pedido_id,
            warnings: labelWarnings,
          };
        }
      }
      if (pedidoIdDup) {
        const labelWarnings = await tryAttachOlistEtiquetaPdf({
          org_id: input.org_id,
          pedido_id: pedidoIdDup,
          olist_pedido_id: pedido.id,
          token,
        });
        return {
          ok: true,
          outcome: "skipped_duplicate",
          pedido_id_dropcore: pedidoIdDup,
          warnings: labelWarnings.length ? labelWarnings : undefined,
        };
      }
      return { ok: true, outcome: "skipped_duplicate" };
    }
    return { ok: false, error: submit.error_message };
  }

  const labelWarnings = await tryAttachOlistEtiquetaPdf({
    org_id: input.org_id,
    pedido_id: submit.pedido_id,
    olist_pedido_id: pedido.id,
    token,
  });

  if (submit.status === "pendente_estoque") {
    return {
      ok: true,
      outcome: "imported_pendente_estoque",
      pedido_id_dropcore: submit.pedido_id,
      warnings: labelWarnings,
    };
  }

  if (submit.status === "bloqueado") {
    return {
      ok: true,
      outcome: "imported_bloqueado",
      pedido_id_dropcore: submit.pedido_id,
      warnings: labelWarnings,
    };
  }

  return {
    ok: true,
    outcome: "imported",
    pedido_id_dropcore: submit.pedido_id,
    warnings: labelWarnings,
  };
}
