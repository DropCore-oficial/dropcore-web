/**
 * Reconciliação completa de estoque pro Mercado Livre — diferente do sync reativo (que só
 * dispara quando algo muda), isso varre TODO SKU mapeado de TODO seller conectado e reenvia
 * o saldo real, de tempo em tempo, mesmo sem nenhuma venda/reposição ter acontecido.
 *
 * Achado real 2026-11-24: um SKU que nunca vendeu (ou nunca foi reabastecido) desde que o
 * anúncio foi publicado nunca recebe NENHUM push — o sync reativo só dispara em cima de
 * evento. O Mercado Livre fica mostrando pra sempre o número de quando o anúncio nasceu
 * (ex: Noblesse, tamanho GG do "Azul Bebê New Blue" — anúncio nasceu com 4un, estoque real
 * zerou depois, nunca teve evento que disparasse correção, ML continuava mostrando 4).
 *
 * Roda separado do cron de 1 minuto (gestores-ia-sync-sku-ml) de propósito — essa rotina
 * toca em TODO SKU de TODO seller numa rodada só, é pesada e bateria rate limit do ML se
 * rodasse tão frequente quanto o resto (já vimos "too_many_requests" só com os crons atuais).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncMercadoLivreEstoqueSkusSeller } from "@/lib/sellerMercadoLivreSyncEstoque";
import { estoqueDisponivelParaVenda } from "@/lib/skuGrupoEstoqueCalculo";

export type ReconciliacaoCompletaResultado = {
  sellers_processados: number;
  skus_reenviados: number;
  sellers_com_erro: number;
};

export async function runMlSyncReconciliacaoCompleta(): Promise<ReconciliacaoCompletaResultado> {
  const { data: sellersConectados, error } = await supabaseAdmin
    .from("seller_mercadolivre_integrations")
    .select("seller_id");
  if (error) throw new Error(error.message);

  let sellersProcessados = 0;
  let skusReenviados = 0;
  let sellersComErro = 0;

  for (const { seller_id } of sellersConectados ?? []) {
    try {
      const { data: sellerRow } = await supabaseAdmin
        .from("sellers")
        .select("org_id")
        .eq("id", seller_id)
        .maybeSingle();
      if (!sellerRow?.org_id) continue;

      const { data: mapRows } = await supabaseAdmin
        .from("seller_mercadolivre_sku_map")
        .select("sku")
        .eq("seller_id", seller_id);
      const codes = Array.from(new Set((mapRows ?? []).map((r) => String((r as { sku: string }).sku).toUpperCase())));
      if (codes.length === 0) continue;

      const { data: skuRows } = await supabaseAdmin
        .from("skus")
        .select("sku, fornecedor_id, estoque_atual, estoque_reservado")
        .eq("org_id", sellerRow.org_id)
        .in("sku", codes);

      // Agrupa por fornecedor — syncMercadoLivreEstoqueSkusSeller é escopado por fornecedor
      // (é assim que resolve a tabela skus), e um seller do CD pode revender de vários.
      const porFornecedor = new Map<string, { codes: string[]; saldo: Map<string, number> }>();
      for (const row of skuRows ?? []) {
        const r = row as { sku: string; fornecedor_id: string; estoque_atual: unknown; estoque_reservado: unknown };
        const fornecedorId = String(r.fornecedor_id);
        const sku = String(r.sku).toUpperCase();
        const saldo = estoqueDisponivelParaVenda(r.estoque_atual, r.estoque_reservado);
        const entry = porFornecedor.get(fornecedorId) ?? { codes: [], saldo: new Map<string, number>() };
        entry.codes.push(sku);
        entry.saldo.set(sku, saldo);
        porFornecedor.set(fornecedorId, entry);
      }

      for (const [fornecedorId, { codes: skuCodes, saldo }] of porFornecedor) {
        await syncMercadoLivreEstoqueSkusSeller({
          sellerId: seller_id,
          orgId: sellerRow.org_id,
          fornecedorId,
          skuCodes,
          saldoOverrides: saldo,
        });
        skusReenviados += skuCodes.length;
      }
      sellersProcessados += 1;
    } catch (e: unknown) {
      sellersComErro += 1;
      console.error("[runMlSyncReconciliacaoCompleta]", seller_id, e);
    }
  }

  return { sellers_processados: sellersProcessados, skus_reenviados: skusReenviados, sellers_com_erro: sellersComErro };
}
