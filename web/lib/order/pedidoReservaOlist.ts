import { liberarReservaEstoquePedido, reservarEstoquePedido } from "@/lib/order/estoqueReserva";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PedidoReservaOlistItem = {
  sku: string;
  quantidade: number;
};

export type ProcessOlistPedidoReservaInput = {
  org_id: string;
  seller_id: string;
  fornecedor_id: string;
  referencia_externa: string;
  items: PedidoReservaOlistItem[];
  comprador_nome?: string | null;
  marketplace_numero?: string | null;
  canal_venda?: string | null;
};

export type ProcessOlistPedidoReservaResult =
  | { ok: true; outcome: "reservado_estoque"; warnings: string[] }
  | { ok: true; outcome: "skipped_sem_itens"; warnings: string[] }
  | { ok: false; error: string };

/**
 * Reserva estoque para um pedido Olist "em aberto" (aguardando pagamento).
 * Idempotente: o índice único parcial em `estoque_reservas` (status='ativa') garante
 * que reprocessar o mesmo pedido (cron a cada 1 min, webhook repetido) não reserva 2x.
 */
export async function processOlistPedidoReserva(
  input: ProcessOlistPedidoReservaInput
): Promise<ProcessOlistPedidoReservaResult> {
  const warnings: string[] = [];

  const itemsValidos = input.items
    .map((item) => ({ sku: item.sku.trim(), quantidade: Math.max(1, Math.floor(item.quantidade)) }))
    .filter((item) => item.sku);

  if (itemsValidos.length === 0) {
    return { ok: true, outcome: "skipped_sem_itens", warnings: [`Pedido ${input.referencia_externa}: sem itens com SKU mapeável.`] };
  }

  for (const item of itemsValidos) {
    const { data: skuRow, error: skuErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku")
      .eq("org_id", input.org_id)
      .eq("fornecedor_id", input.fornecedor_id)
      .ilike("sku", item.sku)
      .eq("status", "ativo")
      .maybeSingle();

    if (skuErr || !skuRow) {
      warnings.push(`Reserva de estoque: SKU não encontrado ou inativo: ${item.sku}.`);
      continue;
    }

    const { error: insertErr } = await supabaseAdmin.from("estoque_reservas").insert({
      org_id: input.org_id,
      seller_id: input.seller_id,
      fornecedor_id: input.fornecedor_id,
      sku_id: skuRow.id,
      quantidade: item.quantidade,
      referencia_externa: input.referencia_externa,
      status: "ativa",
      comprador_nome: input.comprador_nome ?? null,
      marketplace_numero: input.marketplace_numero ?? null,
      canal_venda: input.canal_venda ?? null,
    });

    if (insertErr) {
      const isUniqueViolation =
        insertErr.code === "23505" || String(insertErr.message ?? "").toLowerCase().includes("duplicate key");
      if (isUniqueViolation) {
        // Já existe reserva ativa pra este pedido/SKU — reprocessamento idempotente, mas
        // atualiza a metadata (comprador/marketplace/canal) caso a 1ª tentativa tenha
        // gravado incompleta (ex.: webhook "dados_incompletos" antes do comprador aparecer).
        if (input.comprador_nome || input.marketplace_numero || input.canal_venda) {
          await supabaseAdmin
            .from("estoque_reservas")
            .update({
              comprador_nome: input.comprador_nome ?? null,
              marketplace_numero: input.marketplace_numero ?? null,
              canal_venda: input.canal_venda ?? null,
              atualizado_em: new Date().toISOString(),
            })
            .eq("org_id", input.org_id)
            .eq("seller_id", input.seller_id)
            .eq("referencia_externa", input.referencia_externa)
            .eq("sku_id", skuRow.id)
            .eq("status", "ativa");
        }
        continue;
      }
      warnings.push(`Reserva de estoque: falha ao gravar reserva para SKU ${item.sku} (${insertErr.message}).`);
      continue;
    }

    const reserva = await reservarEstoquePedido([{ sku_id: skuRow.id, sku: skuRow.sku, quantidade: item.quantidade }]);
    if (!reserva.ok) {
      warnings.push(`Reserva de estoque: falha ao incrementar estoque_reservado para SKU ${item.sku} (${reserva.error_message}).`);
      await supabaseAdmin
        .from("estoque_reservas")
        .update({ status: "cancelada", atualizado_em: new Date().toISOString() })
        .eq("org_id", input.org_id)
        .eq("seller_id", input.seller_id)
        .eq("referencia_externa", input.referencia_externa)
        .eq("sku_id", skuRow.id)
        .eq("status", "ativa");
    }
  }

  return { ok: true, outcome: "reservado_estoque", warnings };
}

export type LiberarReservaPorReferenciaResult = {
  ok: boolean;
  liberadas: number;
  warnings: string[];
};

/**
 * Libera (aprovação) ou cancela (pedido cancelado na Olist) as reservas ativas de um pedido.
 * Best-effort: chamado sempre que um pedido antes "em aberto" muda de situação; se falhar,
 * a reserva fica órfã até o cron de expiração (`estoqueReservaExpira.ts`) limpar por TTL.
 */
export async function liberarReservaPorReferencia(params: {
  org_id: string;
  seller_id: string;
  referencia_externa: string;
  novoStatus: "liberada" | "cancelada";
}): Promise<LiberarReservaPorReferenciaResult> {
  const warnings: string[] = [];

  const { data: rows, error: selectErr } = await supabaseAdmin
    .from("estoque_reservas")
    .select("id, sku_id, quantidade")
    .eq("org_id", params.org_id)
    .eq("seller_id", params.seller_id)
    .eq("referencia_externa", params.referencia_externa)
    .eq("status", "ativa");

  if (selectErr) {
    return { ok: false, liberadas: 0, warnings: [`Erro ao buscar reservas ativas: ${selectErr.message}`] };
  }

  const reservas = rows ?? [];
  let liberadas = 0;

  for (const reserva of reservas) {
    const liberar = await liberarReservaEstoquePedido([
      { sku_id: reserva.sku_id as string, quantidade: Number(reserva.quantidade ?? 0) },
    ]);
    if (!liberar.ok) {
      warnings.push(`Falha ao liberar reserva ${reserva.id} (${liberar.error_message}).`);
      continue;
    }
    await supabaseAdmin
      .from("estoque_reservas")
      .update({ status: params.novoStatus, atualizado_em: new Date().toISOString() })
      .eq("id", reserva.id as string);
    liberadas++;
  }

  return { ok: true, liberadas, warnings };
}
