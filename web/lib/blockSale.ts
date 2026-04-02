/**
 * Lógica de bloqueio pré-pago (block-sale).
 * Usada por POST /api/org/financial/block-sale e POST /api/org/pedidos.
 */
import { supabaseAdmin } from "./supabaseAdmin";

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v ?? "0").replace(",", "."));
}

export type BlockSaleInput = {
  org_id: string;
  seller_id: string;
  fornecedor_id?: string | null;
  pedido_id?: string | null;
  valor_fornecedor: number;
  valor_dropcore: number;
};

export type BlockSaleResult =
  | { ok: true; ledger_id: string; valor_total: number; status: string; ciclo_repasse: string | null }
  | { ok: false; code: "SALDO_INSUFICIENTE"; saldo_disponivel: number; valor_total: number }
  | { ok: false; code: "SELLER_NAO_ENCONTRADO" }
  | { ok: false; code: "LEDGER_NAO_DISPONIVEL" }
  | { ok: false; code: "ERRO_LEDGER"; message: string };

export async function executeBlockSale(input: BlockSaleInput): Promise<BlockSaleResult> {
  const valor_fornecedor = toNum(input.valor_fornecedor);
  const valor_dropcore = toNum(input.valor_dropcore);
  const valor_total = valor_fornecedor + valor_dropcore;

  if (valor_fornecedor < 0 || valor_dropcore < 0 || valor_total <= 0) {
    return { ok: false, code: "ERRO_LEDGER", message: "Valores inválidos." };
  }

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id")
    .eq("id", input.seller_id)
    .eq("org_id", input.org_id)
    .single();

  if (!seller) {
    return { ok: false, code: "SELLER_NAO_ENCONTRADO" };
  }

  const { data: saldoRows, error: saldoErr } = await supabaseAdmin.rpc("fn_seller_saldo_from_ledger", {
    p_seller_id: input.seller_id,
  });

  if (saldoErr) {
    return { ok: false, code: "LEDGER_NAO_DISPONIVEL" };
  }

  const saldo = Array.isArray(saldoRows) ? saldoRows[0] : saldoRows;
  const saldo_disponivel = saldo?.saldo_disponivel != null ? Number(saldo.saldo_disponivel) : 0;
  if (saldo_disponivel < valor_total) {
    return {
      ok: false,
      code: "SALDO_INSUFICIENTE",
      saldo_disponivel,
      valor_total,
    };
  }

  const { data: cicloRow } = await supabaseAdmin.rpc("fn_ciclo_repasse", {
    data_evento: new Date().toISOString(),
  });
  const ciclo_repasse = cicloRow ?? null;

  const { data: ledgerRow, error: insertErr } = await supabaseAdmin
    .from("financial_ledger")
    .insert({
      org_id: input.org_id,
      seller_id: input.seller_id,
      fornecedor_id: input.fornecedor_id || null,
      pedido_id: input.pedido_id || null,
      tipo: "BLOQUEIO",
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      status: "BLOQUEADO",
      ciclo_repasse: ciclo_repasse ?? undefined,
      referencia: input.pedido_id ? `pedido ${input.pedido_id}` : null,
    })
    .select("id, valor_total, status, ciclo_repasse")
    .single();

  if (insertErr) {
    return { ok: false, code: "ERRO_LEDGER", message: insertErr.message };
  }

  return {
    ok: true,
    ledger_id: ledgerRow.id,
    valor_total: ledgerRow.valor_total,
    status: ledgerRow.status,
    ciclo_repasse: ledgerRow.ciclo_repasse,
  };
}
