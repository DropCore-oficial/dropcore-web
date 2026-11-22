/**
 * Pull de estoque Mercado Livre (conta própria do fornecedor) → skus.estoque_atual →
 * propagação pros sellers. Lê o saldo (`available_quantity`) direto dos anúncios do
 * fornecedor no ML — não importa como o fornecedor atualizou esse número no ML (manual,
 * planilha terceira, etc), o sync só lê o resultado final e substitui o valor em
 * `skus.estoque_atual` (pra cima ou pra baixo, não é baixa por venda).
 *
 * Agregação quando o mesmo SKU aparece em >1 anúncio/variação: usa o MENOR valor (MIN),
 * não soma nem usa o maior — decisão confirmada com o Sr Stark 2026-11-06. Anúncios do
 * mesmo produto costumam ficar espelhados (ferramentas tipo Upseller sincronizam o mesmo
 * número em todos); se 1 ficar dessincronizado mostrando um valor alto por engano, MAX
 * inflaria estoque fictício (risco de overselling, o problema que essa feature existe pra
 * evitar) — MIN erra sempre pro lado seguro (subestima, nunca superestima).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  mlBuscarTodosItensAtivosEPausados,
  mlBuscarItensDetalheComAtributosVariacao,
  type MercadoLivreItemDetail,
} from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAccessTokenFornecedor } from "@/lib/mercadoLivreApiClientFornecedor";
import { syncEstoqueFornecedorSkus } from "@/lib/fornecedorEstoqueSyncOnChange";

const MAX_SKUS_PER_RUN = 500;

/** Persiste o resultado da rodada (ok/parcial/erro + contadores) na própria linha de
 * integração, pro fornecedor ver em `/fornecedor/integracoes-marketplace` se deu erro em
 * vez de só confiar que funcionou. Best-effort: falha ao gravar o estado não derruba o
 * sync em si (o estoque já foi atualizado, perder só o resumo não é motivo pra erro). */
async function persistSyncState(
  fornecedorId: string,
  status: PullFornecedorEstoqueMercadoLivreResult["status"],
  error: string | null,
  summary: FornecedorMercadoLivreEstoqueSyncSummary,
): Promise<void> {
  try {
    await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracao_sync_state_set", {
      p_fornecedor_id: fornecedorId,
      p_status: status,
      p_error: error,
      p_summary: summary,
    });
  } catch (e) {
    console.error("[fornecedor-mercadolivre-sync] erro ao persistir estado do sync:", e);
  }
}

export type FornecedorMercadoLivreEstoqueSyncSummary = {
  itens_escaneados: number;
  skus_candidatos: number;
  updated: number;
  unchanged: number;
  missing_ml: number;
  errors: number;
  pushed_sellers: number;
};

export type PullFornecedorEstoqueMercadoLivreResult = FornecedorMercadoLivreEstoqueSyncSummary & {
  status: "ok" | "parcial" | "erro";
  error: string | null;
};

/** Extrai SELLER_SKU + available_quantity de um item — nível item e por variação. Mesma
 * lógica de extração de SKU de `mercadoLivreSkuSync.ts` (`extrairSkusDoItem`), com o saldo
 * lido junto na mesma passada (não precisa de 2ª chamada à API). Também devolve
 * item_id/variation_id — usado pra popular `fornecedor_mercadolivre_sku_map`, que permite
 * empurrar baixa pontual pro anúncio quando o seller vende (ver
 * pushEstoqueToFornecedorMercadoLivre em fornecedorMercadoLivreSyncEstoquePush.ts). */
function extrairSkusEEstoqueDoItem(
  item: MercadoLivreItemDetail
): Array<{ sku: string; saldo: number; mlItemId: string; mlVariationId: number }> {
  const encontrados: Array<{ sku: string; saldo: number; mlItemId: string; mlVariationId: number }> = [];

  const topSku = (item.attributes ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
  if (topSku) {
    encontrados.push({
      sku: topSku.trim().toUpperCase(),
      saldo: Math.max(0, Math.floor(item.available_quantity ?? 0)),
      mlItemId: item.id,
      mlVariationId: 0,
    });
  }

  for (const v of item.variations ?? []) {
    const vSku =
      (v.attributes ?? []).find((a) => a.id === "SELLER_SKU")?.value_name ??
      (v.attribute_combinations ?? []).find((a) => a.id === "SELLER_SKU")?.value_name;
    if (vSku) {
      encontrados.push({
        sku: vSku.trim().toUpperCase(),
        saldo: Math.max(0, Math.floor(v.available_quantity ?? 0)),
        mlItemId: item.id,
        mlVariationId: v.id,
      });
    }
  }
  return encontrados;
}

export async function pullFornecedorEstoqueFromMercadoLivre(opts: {
  fornecedorId: string;
  orgId: string;
}): Promise<PullFornecedorEstoqueMercadoLivreResult> {
  const summary: FornecedorMercadoLivreEstoqueSyncSummary = {
    itens_escaneados: 0,
    skus_candidatos: 0,
    updated: 0,
    unchanged: 0,
    missing_ml: 0,
    errors: 0,
    pushed_sellers: 0,
  };

  const ctx = await getValidMercadoLivreAccessTokenFornecedor(opts.fornecedorId);
  if (!ctx) {
    return { ...summary, status: "erro", error: "Fornecedor sem Mercado Livre conectado." };
  }

  let itens: MercadoLivreItemDetail[];
  try {
    const ids = await mlBuscarTodosItensAtivosEPausados(ctx);
    itens = await mlBuscarItensDetalheComAtributosVariacao(ids, ctx);
  } catch {
    const erro = "Falha ao listar anúncios no Mercado Livre.";
    await persistSyncState(opts.fornecedorId, "erro", erro, summary);
    return { ...summary, status: "erro", error: erro };
  }
  summary.itens_escaneados = itens.length;

  // Map<sku, saldo> usando MIN quando o mesmo sku aparece em >1 item/variação. Em paralelo,
  // guarda cada (sku, item_id, variation_id) encontrado pra repopular o mapa de anúncios —
  // é o que permite empurrar baixa pontual pro ML quando o seller vende (ver
  // fn_fornecedor_mercadolivre_sku_map_replace_all).
  const mapaSaldo = new Map<string, number>();
  const mapaAnuncios: Array<{ sku: string; ml_item_id: string; ml_variation_id: number }> = [];
  for (const item of itens) {
    for (const { sku, saldo, mlItemId, mlVariationId } of extrairSkusEEstoqueDoItem(item)) {
      const atual = mapaSaldo.get(sku);
      mapaSaldo.set(sku, atual == null ? saldo : Math.min(atual, saldo));
      mapaAnuncios.push({ sku, ml_item_id: mlItemId, ml_variation_id: mlVariationId });
    }
  }
  summary.skus_candidatos = mapaSaldo.size;

  try {
    await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_sku_map_replace_all", {
      p_fornecedor_id: opts.fornecedorId,
      p_rows: mapaAnuncios,
    });
  } catch (e) {
    console.error("[fornecedor-mercadolivre-sync] erro ao repopular sku_map:", e);
  }

  const { data: rows, error } = await supabaseAdmin
    .from("skus")
    .select("id, sku, estoque_atual, ml_sync_status")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .eq("status", "ativo")
    .limit(MAX_SKUS_PER_RUN);

  if (error) {
    await persistSyncState(opts.fornecedorId, "erro", error.message, summary);
    return { ...summary, status: "erro", error: error.message };
  }

  const changedSkuCodes: string[] = [];
  for (const row of rows ?? []) {
    const sku = String((row as { sku?: string }).sku ?? "").trim().toUpperCase();
    const skuId = (row as { id: string }).id;
    const syncStatusAtual = (row as { ml_sync_status?: string | null }).ml_sync_status ?? null;
    const saldo = mapaSaldo.get(sku);

    if (saldo == null) {
      summary.missing_ml += 1;
      // Só escreve quando muda de estado — evita 1 UPDATE por SKU a cada 5 min pros que já
      // estão (e continuam) sem correspondência.
      if (syncStatusAtual !== "sem_sku_no_ml") {
        await supabaseAdmin.rpc("fn_fornecedor_sku_ml_marcar_sem_correspondencia", {
          p_sku_id: skuId,
          p_org_id: opts.orgId,
          p_fornecedor_id: opts.fornecedorId,
        });
      }
      continue;
    }

    const atual = (row as { estoque_atual?: number | null }).estoque_atual ?? null;
    if (atual === saldo) {
      summary.unchanged += 1;
      // Carimba 'ok' + ml_sync_at mesmo sem mudar o valor — é o que permite mostrar "última
      // confirmação" no hover do estoque na tela de Produtos (pedido do Sr Stark
      // 2026-11-07: sem isso não dava pra saber se um SKU "parado" era porque tava tudo
      // certo ou porque nunca foi checado). Também limpa um 'sem_sku_no_ml' anterior.
      await supabaseAdmin.rpc("fn_fornecedor_sku_estoque_mercadolivre_set", {
        p_sku_id: skuId,
        p_org_id: opts.orgId,
        p_fornecedor_id: opts.fornecedorId,
        p_novo_estoque: saldo,
      });
      continue;
    }

    // p_estoque_anterior fica registrado só até o próximo ciclo "sem mudança" limpar
    // (ver branch unchanged acima, que chama sem esse parâmetro — default null) — é o que
    // faz o hover mostrar "Atualizado de X para Y" só enquanto for recente.
    const { error: rpcErr } = await supabaseAdmin.rpc("fn_fornecedor_sku_estoque_mercadolivre_set", {
      p_sku_id: skuId,
      p_org_id: opts.orgId,
      p_fornecedor_id: opts.fornecedorId,
      p_novo_estoque: saldo,
      p_estoque_anterior: atual,
    });

    if (rpcErr) {
      summary.errors += 1;
    } else {
      summary.updated += 1;
      changedSkuCodes.push(sku);
    }
  }

  if (changedSkuCodes.length > 0) {
    const push = await syncEstoqueFornecedorSkus({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      skuCodes: changedSkuCodes,
      skipFornecedorPush: true,
    });
    summary.pushed_sellers = push.sellers;
  }

  const status: PullFornecedorEstoqueMercadoLivreResult["status"] =
    summary.errors > 0 && summary.updated === 0 ? "erro" : summary.errors > 0 ? "parcial" : "ok";

  const resultError =
    status === "erro"
      ? "Falha ao sincronizar estoque com o Mercado Livre."
      : status === "parcial"
        ? `${summary.errors} SKU(s) com erro ao gravar.`
        : null;

  await persistSyncState(opts.fornecedorId, status, resultError, summary);

  return { ...summary, status, error: resultError };
}

/** Cron: pull de estoque para todos os fornecedores com Mercado Livre conectado. */
export async function runFornecedorMercadoLivreEstoquePullTodos(): Promise<{
  fornecedores: number;
  ok: number;
  parcial: number;
  erro: number;
}> {
  const { data: rows, error } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_integracoes_conectadas_lista");
  if (error) throw new Error(error.message);

  let ok = 0;
  let parcial = 0;
  let erro = 0;

  for (const row of (rows ?? []) as Array<{ fornecedor_id: string; org_id: string }>) {
    try {
      const r = await pullFornecedorEstoqueFromMercadoLivre({ fornecedorId: row.fornecedor_id, orgId: row.org_id });
      if (r.status === "ok") ok += 1;
      else if (r.status === "parcial") parcial += 1;
      else erro += 1;
    } catch {
      erro += 1;
    }
  }

  return { fornecedores: (rows ?? []).length, ok, parcial, erro };
}
