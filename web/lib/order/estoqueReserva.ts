import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type EstoqueReservaItemInput = {
  sku_id: string;
  sku?: string | null;
  quantidade: number;
};

export type EstoqueReservaResult = {
  ok: boolean;
  error_code?: string;
  error_message?: string;
  detalhes?: Record<string, unknown>;
};

type RpcReservaEstoqueSkuRow = {
  ok: boolean;
  error_code: string | null;
  error_message: string | null;
  sku_id: string | null;
  sku: string | null;
  estoque_depois: number | null;
};

function mapRpcErrorCode(
  code: string | null | undefined
): "ESTOQUE_INPUT_INVALIDO" | "SKU_NOT_FOUND" | "ESTOQUE_RESERVA_FAILED" {
  switch (code) {
    case "INVALID_QUANTITY":
      return "ESTOQUE_INPUT_INVALIDO";
    case "SKU_NOT_FOUND":
      return "SKU_NOT_FOUND";
    default:
      return "ESTOQUE_RESERVA_FAILED";
  }
}

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function failReserva(
  error_code: "ESTOQUE_INPUT_INVALIDO" | "SKU_NOT_FOUND" | "ESTOQUE_RESERVA_FAILED",
  error_message: string,
  detalhes?: Record<string, unknown>
): EstoqueReservaResult {
  return { ok: false, error_code, error_message, detalhes };
}

function toIntQuantidade(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? "0").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

async function chamarRpcPorItem(
  items: EstoqueReservaItemInput[],
  rpcName: "rpc_reservar_estoque_sku" | "rpc_liberar_reserva_estoque_sku"
): Promise<EstoqueReservaResult> {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return failReserva("ESTOQUE_INPUT_INVALIDO", "Lista de itens para reserva de estoque está vazia.");
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const skuId = String(item?.sku_id ?? "").trim();
      const quantidade = toIntQuantidade(item?.quantidade);

      if (!skuId || !isLikelyUuid(skuId) || quantidade <= 0) {
        return failReserva("ESTOQUE_INPUT_INVALIDO", `Item inválido para reserva de estoque na posição ${i + 1}.`, {
          index: i,
          sku_id: item?.sku_id ?? null,
          quantidade: item?.quantidade ?? null,
        });
      }

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(rpcName, {
        p_sku_id: skuId,
        p_quantidade: quantidade,
      });

      if (rpcErr) {
        return failReserva("ESTOQUE_RESERVA_FAILED", `Erro ao chamar RPC de reserva de estoque (${rpcName}).`, {
          index: i,
          sku_id: skuId,
          cause: rpcErr.message,
        });
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!row || typeof (row as RpcReservaEstoqueSkuRow).ok !== "boolean") {
        return failReserva("ESTOQUE_RESERVA_FAILED", "Resposta inválida da RPC de reserva de estoque.", {
          index: i,
          sku_id: skuId,
        });
      }

      const rpcRow = row as RpcReservaEstoqueSkuRow;
      if (!rpcRow.ok) {
        const mapped = mapRpcErrorCode(rpcRow.error_code);
        const msg =
          typeof rpcRow.error_message === "string" && rpcRow.error_message.trim().length > 0
            ? rpcRow.error_message
            : "Falha ao processar reserva de estoque.";
        return failReserva(mapped, msg, {
          index: i,
          sku_id: skuId,
          rpc_error_code: rpcRow.error_code,
        });
      }
    }

    return { ok: true };
  } catch (e: unknown) {
    return failReserva("ESTOQUE_RESERVA_FAILED", "Erro inesperado ao processar reserva de estoque.", {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Incrementa `estoque_reservado` por item (pedido Olist em_aberto). */
export async function reservarEstoquePedido(items: EstoqueReservaItemInput[]): Promise<EstoqueReservaResult> {
  return chamarRpcPorItem(items, "rpc_reservar_estoque_sku");
}

/** Decrementa `estoque_reservado` por item (pedido aprovado, cancelado ou reserva expirada). */
export async function liberarReservaEstoquePedido(items: EstoqueReservaItemInput[]): Promise<EstoqueReservaResult> {
  return chamarRpcPorItem(items, "rpc_liberar_reserva_estoque_sku");
}
