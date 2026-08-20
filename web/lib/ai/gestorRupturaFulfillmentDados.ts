/**
 * Dado real pro gestor "Risco de Ruptura & Fulfillment": estoque dos SKUs habilitados do
 * seller (skus.estoque_atual/estoque_minimo, já sincronizado via Olist/Bling) cruzado com
 * a venda dos últimos 30 dias (pedido_itens, fonte de verdade de item vendido — não
 * pedidos.sku_id, que é campo legado de single-item).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SkuRupturaContexto } from "./gestorPrompts";

const JANELA_VELOCIDADE_DIAS = 30;

type HabilitadoComSku = {
  sku_id: string;
  skus: {
    sku: string;
    nome_produto: string | null;
    estoque_atual: number | null;
    estoque_minimo: number | null;
  } | null;
};

type PedidoItemComPedido = {
  sku_id: string;
  quantidade: number | null;
  pedidos: { seller_id: string; status: string; criado_em: string } | null;
};

export async function buscarDadosRupturaFulfillment(
  sellerId: string
): Promise<SkuRupturaContexto[]> {
  const { data: habilitadosRaw, error: habilitadosErr } = await supabaseAdmin
    .from("seller_skus_habilitados")
    .select("sku_id, skus(sku, nome_produto, estoque_atual, estoque_minimo)")
    .eq("seller_id", sellerId);

  if (habilitadosErr) throw new Error(habilitadosErr.message);

  const habilitados = (habilitadosRaw ?? []) as unknown as HabilitadoComSku[];
  if (habilitados.length === 0) return [];

  const skuIds = habilitados.map((h) => h.sku_id);
  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_VELOCIDADE_DIAS);

  const { data: itensRaw, error: itensErr } = await supabaseAdmin
    .from("pedido_itens")
    .select("sku_id, quantidade, pedidos!inner(seller_id, status, criado_em)")
    .in("sku_id", skuIds)
    .eq("pedidos.seller_id", sellerId)
    .neq("pedidos.status", "cancelado")
    .gte("pedidos.criado_em", desde.toISOString());

  if (itensErr) throw new Error(itensErr.message);

  const itens = (itensRaw ?? []) as unknown as PedidoItemComPedido[];
  const vendasPorSku = new Map<string, number>();
  for (const item of itens) {
    const atual = vendasPorSku.get(item.sku_id) ?? 0;
    vendasPorSku.set(item.sku_id, atual + (item.quantidade ?? 0));
  }

  return habilitados
    .filter((h) => h.skus !== null)
    .map((h) => {
      const sku = h.skus as NonNullable<HabilitadoComSku["skus"]>;
      return {
        sku: sku.sku,
        nomeProduto: sku.nome_produto ?? sku.sku,
        estoqueAtual: sku.estoque_atual ?? 0,
        estoqueMinimo: sku.estoque_minimo ?? 0,
        vendas30d: vendasPorSku.get(h.sku_id) ?? 0,
      };
    });
}
