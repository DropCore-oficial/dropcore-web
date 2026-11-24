/**
 * Log de toda tentativa (sucesso ou falha) de push de estoque fornecedor→Mercado Livre —
 * ver web/scripts/create-ml-sync-log-estoque.sql. Diferente de mlSyncFalhas.ts (fila de
 * retry, só grava problema), isso é histórico visível pro fornecedor/admin confirmarem que
 * um ajuste de estoque chegou no anúncio sem precisar acesso à conta ML do seller.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function registrarMlSyncLog(opts: {
  orgId: string;
  sellerId: string;
  fornecedorId: string | null;
  sku: string;
  mlItemId: string | null;
  estoqueEnviado: number | null;
  sucesso: boolean;
  erro?: string | null;
  /** Valor que o próprio Mercado Livre ecoou na resposta do PUT — confirmação de que
   * gravou lá, não só que o HTTP voltou 200 (ver mlAtualizarEstoque). */
  estoqueConfirmado?: number | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fn_ml_sync_log_registrar", {
    p_org_id: opts.orgId,
    p_seller_id: opts.sellerId,
    p_fornecedor_id: opts.fornecedorId,
    p_sku: opts.sku,
    p_ml_item_id: opts.mlItemId,
    p_estoque_enviado: opts.estoqueEnviado,
    p_sucesso: opts.sucesso,
    p_erro: opts.erro ? opts.erro.slice(0, 2000) : null,
    p_estoque_confirmado: opts.estoqueConfirmado ?? null,
  });
  if (error) console.error("[registrarMlSyncLog]", opts.sellerId, opts.sku, error.message);
}

export type MlSyncLogEntrada = {
  id: string;
  seller_id: string;
  seller_nome: string;
  sku: string;
  ml_item_id: string | null;
  estoque_enviado: number | null;
  estoque_confirmado: number | null;
  sucesso: boolean;
  erro: string | null;
  criado_em: string;
};

export async function listarMlSyncLogPorFornecedor(
  fornecedorId: string,
  opts?: { sku?: string; limit?: number }
): Promise<MlSyncLogEntrada[]> {
  const { data, error } = await supabaseAdmin.rpc("fn_ml_sync_log_listar_por_fornecedor", {
    p_fornecedor_id: fornecedorId,
    p_sku: opts?.sku ?? null,
    p_limit: opts?.limit ?? 20,
  });
  if (error) {
    console.error("[listarMlSyncLogPorFornecedor]", fornecedorId, error.message);
    return [];
  }
  return (data ?? []) as MlSyncLogEntrada[];
}
