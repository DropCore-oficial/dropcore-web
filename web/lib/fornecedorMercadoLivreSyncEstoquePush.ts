/**
 * Push DIRETO de estoque DropCore→Mercado Livre do PRÓPRIO FORNECEDOR — fecha o gap que o
 * pull (fornecedorMercadoLivreSyncEstoque.ts) não cobre: até aqui, quando o seller vendia um
 * SKU, a baixa só era empurrada pro ML do seller (sellerMercadoLivreSyncEstoque.ts) e pra
 * Olist do fornecedor, nunca pro próprio anúncio ML do fornecedor. Se o fornecedor vende o
 * mesmo SKU direto no próprio anúncio, ficava uma janela de overselling até o próximo pull
 * (até 5min, ou o webhook do fornecedor perceber a venda dele mesmo).
 *
 * Usa o vínculo sku↔anúncio em `fornecedor_mercadolivre_sku_map`, repopulado a cada rodada
 * do pull — não tenta resync on-miss (diferente de sellerMercadoLivreSyncEstoque.ts): aqui o
 * mapa já é atualizado a cada 5min/webhook pelo próprio pull, então um SKU sem entrada no
 * mapa é tratado como "sem correspondência agora" e se autocorrige no próximo ciclo.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mlAtualizarEstoque, type MercadoLivreEstoqueAtualizacao } from "@/lib/mercadoLivreApiClient";
import { getValidMercadoLivreAccessTokenFornecedor } from "@/lib/mercadoLivreApiClientFornecedor";
import { estoqueDisponivelParaVenda } from "@/lib/sellerOlistSyncEstoque";

const API_PAUSE_MS = 220;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LinhaMapaSku = { sku: string; ml_item_id: string; ml_variation_id: number };

export type PushFornecedorMercadoLivreResult = {
  conectado: boolean;
  itens_atualizados: number;
  falhas: number;
};

const VAZIO: PushFornecedorMercadoLivreResult = { conectado: false, itens_atualizados: 0, falhas: 0 };

/** Empurra o saldo disponível pros anúncios do ML do fornecedor vinculados a esses SKUs.
 * Silenciosamente não faz nada se o fornecedor não tiver ML conectado ou nenhum SKU
 * mapeado — não é erro, é o caso normal de fornecedor sem ML ou sem anúncio desse SKU. */
export async function pushEstoqueToFornecedorMercadoLivre(opts: {
  orgId: string;
  fornecedorId: string;
  skuCodes: string[];
  /** Saldo já calculado por quem chama (evita reconsultar `skus`) — chave = SKU em upper-case. */
  saldoOverrides?: Map<string, number>;
}): Promise<PushFornecedorMercadoLivreResult> {
  const codes = [...new Set(opts.skuCodes.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (codes.length === 0) return VAZIO;

  const ctx = await getValidMercadoLivreAccessTokenFornecedor(opts.fornecedorId);
  if (!ctx) return VAZIO;

  const { data: mapRows, error: mapErr } = await supabaseAdmin.rpc("fn_fornecedor_mercadolivre_sku_map_get", {
    p_fornecedor_id: opts.fornecedorId,
    p_skus: codes,
  });
  if (mapErr) {
    console.error("[pushEstoqueToFornecedorMercadoLivre] sku_map_get:", opts.fornecedorId, mapErr.message);
    return { conectado: true, itens_atualizados: 0, falhas: 0 };
  }
  const linhas = (mapRows ?? []) as LinhaMapaSku[];
  if (linhas.length === 0) return { conectado: true, itens_atualizados: 0, falhas: 0 };

  const saldoPorSku = new Map(opts.saldoOverrides ?? []);
  const faltando = codes.filter((c) => !saldoPorSku.has(c));
  if (faltando.length > 0) {
    const { data: skuRows } = await supabaseAdmin
      .from("skus")
      .select("sku, estoque_atual, estoque_reservado")
      .eq("org_id", opts.orgId)
      .eq("fornecedor_id", opts.fornecedorId)
      .in("sku", faltando);
    for (const row of skuRows ?? []) {
      const sku = String((row as { sku?: string }).sku ?? "").toUpperCase();
      if (!sku) continue;
      saldoPorSku.set(
        sku,
        estoqueDisponivelParaVenda(
          (row as { estoque_atual?: unknown }).estoque_atual,
          (row as { estoque_reservado?: unknown }).estoque_reservado
        )
      );
    }
  }

  // Mesmo sku pode estar em >1 anúncio (produto republicado) — agrupa por item_id pra
  // mandar 1 PUT por anúncio, cada um com o MESMO saldo final (é o mesmo estoque físico).
  const porItem = new Map<string, MercadoLivreEstoqueAtualizacao[]>();
  for (const linha of linhas) {
    const sku = linha.sku.toUpperCase();
    const saldo = saldoPorSku.get(sku);
    if (saldo == null) continue;
    const lista = porItem.get(linha.ml_item_id) ?? [];
    lista.push({ variationId: Number(linha.ml_variation_id ?? 0), availableQuantity: saldo });
    porItem.set(linha.ml_item_id, lista);
  }

  const result: PushFornecedorMercadoLivreResult = { conectado: true, itens_atualizados: 0, falhas: 0 };
  const itens = [...porItem.entries()];
  // Sequencial com pausa entre chamadas (não dispara tudo de uma vez pro ML) — se o mesmo
  // SKU estiver em muitos anúncios, erro em 1 não trava os demais.
  for (let i = 0; i < itens.length; i++) {
    const [itemId, atualizacoes] = itens[i]!;
    try {
      const r = await mlAtualizarEstoque(itemId, atualizacoes, ctx);
      if (r.ok) {
        result.itens_atualizados += 1;
      } else {
        result.falhas += 1;
        console.error("[pushEstoqueToFornecedorMercadoLivre]", opts.fornecedorId, itemId, r.erro);
      }
    } catch (e: unknown) {
      result.falhas += 1;
      console.error("[pushEstoqueToFornecedorMercadoLivre]", opts.fornecedorId, itemId, e);
    }
    if (i + 1 < itens.length) await sleep(API_PAUSE_MS);
  }

  return result;
}
