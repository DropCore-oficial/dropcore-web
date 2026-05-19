import { submitSellerErpPedido } from "@/lib/erp/submitSellerErpPedido";
import {
  fetchUrlAsPdfBase64,
  obterExpedicaoPorPedidoVenda,
  obterLinksEtiquetasImpressaoOlist,
  obterPedidoOlist,
  lancarSaidaEstoqueOlistProduto,
  resolverIdProdutoOlistPorCodigo,
  type OlistPedidoDetalhe,
} from "@/lib/olistTinyApi";
import { shouldImportCodigoSituacao, shouldImportSituacaoText } from "@/lib/olistPedidoImportPolicy";
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
      id_produto: item.id_produto,
    }))
    .filter((item) => item.sku);
}

async function enrichItensComIdProdutoOlist(
  token: string,
  items: Array<{ sku: string; quantidade: number; id_produto: number | null }>
): Promise<void> {
  for (const item of items) {
    if (item.id_produto) continue;
    const id = await resolverIdProdutoOlistPorCodigo(token, item.sku);
    await sleep(OLIST_API_PAUSE_MS);
    if (id) item.id_produto = id;
  }
}

async function tryAttachOlistEtiquetaPdf(params: {
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

async function pushOlistStockForItems(
  token: string,
  pedidoId: number,
  items: Array<{ sku: string; quantidade: number; id_produto: number | null }>
): Promise<string[]> {
  const warnings: string[] = [];

  for (const item of items) {
    if (!item.id_produto) {
      warnings.push(`SKU ${item.sku}: sem id_produto na Olist/Tiny para baixa de estoque.`);
      continue;
    }
    try {
      await lancarSaidaEstoqueOlistProduto(token, {
        idProduto: item.id_produto,
        quantidade: item.quantidade,
        observacoes: `DropCore pedido olist:${pedidoId}`,
      });
      await sleep(OLIST_API_PAUSE_MS);
    } catch (e: unknown) {
      warnings.push(
        `SKU ${item.sku}: falha ao atualizar estoque na Olist/Tiny (${e instanceof Error ? e.message : "erro desconhecido"}).`
      );
    }
  }

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
  | { ok: true; outcome: "skipped_duplicate"; pedido_id_dropcore?: string; warnings?: string[] }
  | { ok: true; outcome: "skipped_situacao" }
  | { ok: true; outcome: "skipped_sem_itens"; warnings: string[] }
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
  if (codigo && !shouldImportCodigoSituacao(codigo)) {
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

  if (!shouldImportSituacaoText(pedido.situacao)) {
    return { ok: true, outcome: "skipped_situacao" };
  }

  const items = mapPedidoItems(pedido);
  if (items.length === 0) {
    return {
      ok: true,
      outcome: "skipped_sem_itens",
      warnings: [`Pedido ${pedido.id}: sem itens com SKU mapeável.`],
    };
  }

  await enrichItensComIdProdutoOlist(token, items);

  const { data: sellerRow, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
    .eq("id", input.seller_id)
    .eq("org_id", input.org_id)
    .maybeSingle();

  if (sellerErr || !sellerRow) {
    return { ok: false, error: "Seller não encontrado." };
  }

  const referencia = buildReferenciaExterna(pedido.id);
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
  });

  if (!submit.ok) {
    if (submit.error_code === "PEDIDO_DUPLICADO") {
      let pedidoIdDup = submit.pedido_existente?.pedido_id ?? null;
      if (!pedidoIdDup) {
        const ref = buildReferenciaExterna(pedido.id);
        const { data: rowDup, error: rowDupErr } = await supabaseAdmin
          .from("pedidos")
          .select("id")
          .eq("org_id", input.org_id)
          .eq("seller_id", input.seller_id)
          .eq("referencia_externa", ref)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!rowDupErr && rowDup?.id) pedidoIdDup = rowDup.id;
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

  const stockWarnings = await pushOlistStockForItems(token, pedido.id, items);
  const labelWarnings = await tryAttachOlistEtiquetaPdf({
    org_id: input.org_id,
    pedido_id: submit.pedido_id,
    olist_pedido_id: pedido.id,
    token,
  });

  return {
    ok: true,
    outcome: "imported",
    pedido_id_dropcore: submit.pedido_id,
    warnings: [...stockWarnings, ...labelWarnings],
  };
}
