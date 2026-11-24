import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  estoqueDisponivelParaVenda,
  skusGrupoComPaiSoma,
  grupoKeyFromSkuString,
  type SkuGrupoRow,
} from "@/lib/skuGrupoEstoqueCalculo";
import { loadSkusGrupoFornecedor } from "@/lib/skuGrupoLoad";
import { syncMercadoLivreEstoqueSkusSeller } from "@/lib/sellerMercadoLivreSyncEstoque";
import { pushEstoqueToFornecedorMercadoLivre } from "@/lib/fornecedorMercadoLivreSyncEstoquePush";

function skuGrupoRowMinimo(sku: string, estoqueAtual: number | null): SkuGrupoRow {
  return {
    sku,
    nome_produto: "",
    cor: "",
    tamanho: "",
    status: "ativo",
    categoria: null,
    estoque_atual: estoqueAtual,
    custo_total: null,
    imagem_url: null,
    link_fotos: null,
    descricao: null,
    ncm: null,
    origem: null,
    marca: null,
    cest: null,
    peso_kg: null,
    peso_liquido_kg: null,
    peso_bruto_kg: null,
    comprimento_cm: null,
    largura_cm: null,
    altura_cm: null,
    habilitado_venda: false,
  };
}

export type SyncEstoqueOutboundOpts = {
  orgId: string;
  fornecedorId: string;
  /** Quando true, não empurra de volta pro ML do armazém (mudança veio do webhook/cron do fornecedor). */
  skipFornecedorPush?: boolean;
};

/** Dispara sync de estoque pro Mercado Livre em background (não bloqueia pedido/upload).
 *
 * Usa `after()` (Next.js 15) em vez de só `void promise.catch()` — achado real
 * 2026-10-25: numa serverless function da Vercel, depois que a rota devolve a resposta
 * (`NextResponse.json`), a instância pode ser congelada/encerrada ANTES de uma promise
 * solta (não aguardada) terminar, sem nenhum erro. Reproduzido ao vivo: fornecedor
 * restockou SKU que tinha anúncio pausado por falta de estoque no ML — `skus.estoque_atual`
 * gravou certo (isso é `await`do antes do response), mas o push pro ML nunca saiu do lugar
 * e nem chegou a registrar falha (processo morreu antes de chegar lá). `after()` garante
 * que a função só é encerrada depois que este callback terminar. */
export function dispararSyncEstoqueFornecedorSkus(
  opts: SyncEstoqueOutboundOpts & { skuCodes: string[] },
): void {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return;

  after(() =>
    syncEstoqueFornecedorSkus({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      skuCodes,
      skipFornecedorPush: opts.skipFornecedorPush,
    }).catch((e: unknown) => {
      console.error("[dispararSyncEstoqueFornecedorSkus]", skuCodes.join(","), e);
    })
  );
}

export function dispararSyncEstoqueFornecedorGrupo(
  opts: SyncEstoqueOutboundOpts & { grupoKey: string },
): void {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return;

  after(() =>
    syncEstoqueFornecedorGrupo({
      orgId: opts.orgId,
      fornecedorId: opts.fornecedorId,
      grupoKey,
      skipFornecedorPush: opts.skipFornecedorPush,
    }).catch((e: unknown) => {
      console.error("[dispararSyncEstoqueFornecedorGrupo]", grupoKey, e);
    })
  );
}

/** Após venda ou reposição — empurra saldo DropCore pro ML do armazém e de todos os sellers. */
export async function syncEstoqueFornecedorSkus(
  opts: SyncEstoqueOutboundOpts & { skuCodes: string[] },
): Promise<{ sellers: number; fornecedorMlOk: number }> {
  const skuCodes = opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (skuCodes.length === 0) return { sellers: 0, fornecedorMlOk: 0 };

  let fornecedorMlOk = 0;
  if (!opts.skipFornecedorPush) {
    try {
      const mlResult = await pushEstoqueToFornecedorMercadoLivre({
        orgId: opts.orgId,
        fornecedorId: opts.fornecedorId,
        skuCodes,
      });
      fornecedorMlOk = mlResult.itens_atualizados;
    } catch (e: unknown) {
      console.error("[syncEstoqueFornecedorSkus] pushEstoqueToFornecedorMercadoLivre", opts.fornecedorId, e);
    }
  }

  const { data: vinculos, error } = await supabaseAdmin
    .from("seller_fornecedor_vinculos")
    .select("seller_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .is("desvinculado_em", null);

  if (error) {
    console.error("[syncEstoqueFornecedorSkus] seller_fornecedor_vinculos:", error.message);
    return { sellers: 0, fornecedorMlOk };
  }

  let synced = 0;
  for (const row of vinculos ?? []) {
    const sellerId = String((row as { seller_id: string }).seller_id);
    try {
      await syncMercadoLivreEstoqueSkusSeller({
        sellerId,
        orgId: opts.orgId,
        fornecedorId: opts.fornecedorId,
        skuCodes,
      });
      synced += 1;
    } catch (e: unknown) {
      console.error("[syncMercadoLivreEstoqueSkusSeller]", sellerId, e);
    }
  }

  return { sellers: synced, fornecedorMlOk };
}

export async function syncEstoqueFornecedorGrupo(
  opts: SyncEstoqueOutboundOpts & { grupoKey: string },
): Promise<{ sellers: number; fornecedorMlOk: number }> {
  const grupoKey = opts.grupoKey.trim().toUpperCase();
  if (!grupoKey) return { sellers: 0, fornecedorMlOk: 0 };

  let fornecedorMlOk = 0;
  if (!opts.skipFornecedorPush) {
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("skus")
      .select("sku, estoque_atual, estoque_reservado")
      .eq("org_id", opts.orgId)
      .eq("fornecedor_id", opts.fornecedorId)
      .like("sku", `${grupoKey.length >= 3 ? grupoKey.slice(0, -3) : grupoKey}%`);

    if (!rowsErr && rows?.length) {
      const items: SkuGrupoRow[] = rows.map((row) => {
        const atual = (row as { estoque_atual?: number | null }).estoque_atual;
        const disponivel =
          atual == null ? null : estoqueDisponivelParaVenda(atual, (row as { estoque_reservado?: number | null }).estoque_reservado);
        return skuGrupoRowMinimo(String((row as { sku?: string }).sku ?? ""), disponivel);
      });
      const loaded = skusGrupoComPaiSoma(items, grupoKey);
      if (loaded.skuCodes.length) {
        try {
          const mlResult = await pushEstoqueToFornecedorMercadoLivre({
            orgId: opts.orgId,
            fornecedorId: opts.fornecedorId,
            skuCodes: loaded.skuCodes,
            saldoOverrides: loaded.saldoOverrides,
          });
          fornecedorMlOk = mlResult.itens_atualizados;
        } catch (e: unknown) {
          console.error("[syncEstoqueFornecedorGrupo] pushEstoqueToFornecedorMercadoLivre", opts.fornecedorId, e);
        }
      }
    }
  }

  const { data: vinculos, error } = await supabaseAdmin
    .from("seller_fornecedor_vinculos")
    .select("seller_id")
    .eq("org_id", opts.orgId)
    .eq("fornecedor_id", opts.fornecedorId)
    .is("desvinculado_em", null);

  if (error) {
    console.error("[syncEstoqueFornecedorGrupo] seller_fornecedor_vinculos:", error.message);
    return { sellers: 0, fornecedorMlOk };
  }

  let synced = 0;
  for (const row of vinculos ?? []) {
    const sellerId = String((row as { seller_id: string }).seller_id);
    try {
      const loaded = await loadSkusGrupoFornecedor({
        orgId: opts.orgId,
        fornecedorId: opts.fornecedorId,
        grupoKey,
        supabase: supabaseAdmin,
      });
      if (loaded.ok) {
        const { skuCodes: skuCodesGrupo } = skusGrupoComPaiSoma(loaded.items, grupoKey);
        await syncMercadoLivreEstoqueSkusSeller({
          sellerId,
          orgId: opts.orgId,
          fornecedorId: opts.fornecedorId,
          skuCodes: skuCodesGrupo,
        });
        synced += 1;
      }
    } catch (e: unknown) {
      console.error("[syncMercadoLivreEstoqueSkusSeller]", sellerId, grupoKey, e);
    }
  }

  return { sellers: synced, fornecedorMlOk };
}

export { grupoKeyFromSkuString };
