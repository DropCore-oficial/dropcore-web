import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type EstoquePedidoItemInput = {
  sku_id: string;
  sku?: string | null;
  quantidade: number;
};

export type EstoquePedidoDebito = {
  sku_id: string;
  sku: string | null;
  quantidade: number;
  estoque_antes: number;
  estoque_depois: number;
};

export type EstoquePedidoResult = {
  ok: boolean;
  debitos?: EstoquePedidoDebito[];
  error_code?: string;
  error_message?: string;
  detalhes?: Record<string, unknown>;
};

type RpcDebitarEstoqueSkuRow = {
  ok: boolean;
  error_code: string | null;
  error_message: string | null;
  sku_id: string | null;
  sku: string | null;
  estoque_depois: number | null;
};

function mapRpcDebitErrorCode(
  code: string | null | undefined
): "ESTOQUE_INPUT_INVALIDO" | "SKU_NOT_FOUND" | "ESTOQUE_INSUFICIENTE" | "ESTOQUE_DEBITO_FAILED" {
  switch (code) {
    case "INVALID_QUANTITY":
      return "ESTOQUE_INPUT_INVALIDO";
    case "SKU_NOT_FOUND":
      return "SKU_NOT_FOUND";
    case "ESTOQUE_INSUFICIENTE":
      return "ESTOQUE_INSUFICIENTE";
    default:
      return "ESTOQUE_DEBITO_FAILED";
  }
}

function mapRpcRevertErrorCode(
  code: string | null | undefined
): "ESTOQUE_INPUT_INVALIDO" | "SKU_NOT_FOUND" | "ESTOQUE_REVERSAO_FAILED" {
  switch (code) {
    case "INVALID_QUANTITY":
      return "ESTOQUE_INPUT_INVALIDO";
    case "SKU_NOT_FOUND":
      return "SKU_NOT_FOUND";
    default:
      return "ESTOQUE_REVERSAO_FAILED";
  }
}

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function failEstoque(
  error_code:
    | "ESTOQUE_INPUT_INVALIDO"
    | "SKU_NOT_FOUND"
    | "ESTOQUE_INSUFICIENTE"
    | "ESTOQUE_DEBITO_FAILED"
    | "ESTOQUE_REVERSAO_FAILED",
  error_message: string,
  detalhes?: Record<string, unknown>
): EstoquePedidoResult {
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

/**
 * Débito por item via `rpc_debitar_estoque_sku` (atômico por SKU no banco).
 */
export async function debitarEstoquePedido(items: EstoquePedidoItemInput[]): Promise<EstoquePedidoResult> {
  const debitos: EstoquePedidoDebito[] = [];
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return failEstoque("ESTOQUE_INPUT_INVALIDO", "Lista de itens para débito de estoque está vazia.");
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const skuId = String(item?.sku_id ?? "").trim();
      const quantidade = toIntQuantidade(item?.quantidade);

      if (!skuId || !isLikelyUuid(skuId) || quantidade <= 0) {
        return failEstoque(
          "ESTOQUE_INPUT_INVALIDO",
          `Item inválido para débito de estoque na posição ${i + 1}.`,
          {
            index: i,
            sku_id: item?.sku_id ?? null,
            quantidade: item?.quantidade ?? null,
            ...(debitos.length > 0 ? { debitos_parciais: debitos } : {}),
          }
        );
      }

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("rpc_debitar_estoque_sku", {
        p_sku_id: skuId,
        p_quantidade: quantidade,
      });

      if (rpcErr) {
        return failEstoque("ESTOQUE_DEBITO_FAILED", "Erro ao chamar RPC de débito de estoque.", {
          index: i,
          sku_id: skuId,
          cause: rpcErr.message,
          ...(debitos.length > 0 ? { debitos_parciais: debitos } : {}),
        });
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!row || typeof (row as RpcDebitarEstoqueSkuRow).ok !== "boolean") {
        return failEstoque("ESTOQUE_DEBITO_FAILED", "Resposta inválida da RPC de débito de estoque.", {
          index: i,
          sku_id: skuId,
          ...(debitos.length > 0 ? { debitos_parciais: debitos } : {}),
        });
      }

      const rpcRow = row as RpcDebitarEstoqueSkuRow;

      if (!rpcRow.ok) {
        const mapped = mapRpcDebitErrorCode(rpcRow.error_code);
        const msg =
          typeof rpcRow.error_message === "string" && rpcRow.error_message.trim().length > 0
            ? rpcRow.error_message
            : "Falha ao debitar estoque.";
        return failEstoque(mapped, msg, {
          index: i,
          sku_id: skuId,
          rpc_error_code: rpcRow.error_code,
          ...(debitos.length > 0 ? { debitos_parciais: debitos } : {}),
        });
      }

      const estoqueDepois = toIntQuantidade(rpcRow.estoque_depois ?? 0);
      const estoqueAntes = estoqueDepois + quantidade;
      const skuCode = rpcRow.sku ?? item?.sku ?? null;
      const resolvedSkuId = typeof rpcRow.sku_id === "string" && rpcRow.sku_id.trim() ? rpcRow.sku_id.trim() : skuId;

      debitos.push({
        sku_id: resolvedSkuId,
        sku: skuCode,
        quantidade,
        estoque_antes: estoqueAntes,
        estoque_depois: estoqueDepois,
      });
    }

    return { ok: true, debitos };
  } catch (e: unknown) {
    return failEstoque("ESTOQUE_DEBITO_FAILED", "Erro inesperado ao debitar estoque.", {
      cause: e instanceof Error ? e.message : String(e),
      ...(debitos.length > 0 ? { debitos_parciais: debitos } : {}),
    });
  }
}

/**
 * Reversão por item via `rpc_reverter_estoque_sku`, com incremento seguro
 * (`estoque_atual = estoque_atual + quantidade`) para evitar sobrescrita por snapshot.
 */
export async function reverterEstoquePedido(debitos: EstoquePedidoDebito[]): Promise<EstoquePedidoResult> {
  try {
    if (!Array.isArray(debitos) || debitos.length === 0) {
      return failEstoque("ESTOQUE_INPUT_INVALIDO", "Lista de débitos para reversão está vazia.");
    }

    for (let i = 0; i < debitos.length; i++) {
      const debito = debitos[i];
      const skuId = String(debito?.sku_id ?? "").trim();
      const quantidade = toIntQuantidade(debito?.quantidade);

      if (!skuId || !isLikelyUuid(skuId) || quantidade <= 0) {
        return failEstoque("ESTOQUE_INPUT_INVALIDO", `Débito inválido para reversão na posição ${i + 1}.`, {
          index: i,
          sku_id: debito?.sku_id ?? null,
          quantidade: debito?.quantidade ?? null,
        });
      }

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("rpc_reverter_estoque_sku", {
        p_sku_id: skuId,
        p_quantidade: quantidade,
      });

      if (rpcErr) {
        return failEstoque("ESTOQUE_REVERSAO_FAILED", "Erro ao chamar RPC de reversão de estoque.", {
          index: i,
          sku_id: skuId,
          cause: rpcErr.message,
        });
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!row || typeof (row as RpcDebitarEstoqueSkuRow).ok !== "boolean") {
        return failEstoque("ESTOQUE_REVERSAO_FAILED", "Resposta inválida da RPC de reversão de estoque.", {
          index: i,
          sku_id: skuId,
        });
      }

      const rpcRow = row as RpcDebitarEstoqueSkuRow;
      if (!rpcRow.ok) {
        const mapped = mapRpcRevertErrorCode(rpcRow.error_code);
        const msg =
          typeof rpcRow.error_message === "string" && rpcRow.error_message.trim().length > 0
            ? rpcRow.error_message
            : "Falha ao reverter estoque.";
        return failEstoque(mapped, msg, {
          index: i,
          sku_id: skuId,
          rpc_error_code: rpcRow.error_code,
        });
      }
    }

    return { ok: true, debitos };
  } catch (e: unknown) {
    return failEstoque("ESTOQUE_REVERSAO_FAILED", "Erro inesperado ao reverter estoque.", {
      cause: e instanceof Error ? e.message : String(e),
    });
  }
}
