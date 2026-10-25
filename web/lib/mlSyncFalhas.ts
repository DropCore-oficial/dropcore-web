/**
 * Log persistente + retry de falha de sync com o Mercado Livre (push de estoque ou
 * ingestão de pedido) — ver web/scripts/create-ml-sync-falhas-log-retry.sql. Antes disso,
 * qualquer falha nesses dois caminhos virava só console.error (perdido em produção).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MlSyncFalhaTipo = "estoque_push" | "pedido_ingest";

export async function registrarMlSyncFalha(opts: {
  orgId: string;
  sellerId: string;
  fornecedorId: string | null;
  tipo: MlSyncFalhaTipo;
  sku?: string | null;
  mlItemId?: string | null;
  referenciaExterna?: string | null;
  erro: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fn_ml_sync_falha_registrar", {
    p_org_id: opts.orgId,
    p_seller_id: opts.sellerId,
    p_fornecedor_id: opts.fornecedorId,
    p_tipo: opts.tipo,
    p_sku: opts.sku ?? null,
    p_ml_item_id: opts.mlItemId ?? null,
    p_referencia_externa: opts.referenciaExterna ?? null,
    p_erro: opts.erro.slice(0, 2000),
  });
  if (error) console.error("[registrarMlSyncFalha]", opts.tipo, opts.sellerId, error.message);
}

export type MlSyncFalhaPendente = {
  id: string;
  org_id: string;
  seller_id: string;
  fornecedor_id: string | null;
  tipo: MlSyncFalhaTipo;
  sku: string | null;
  ml_item_id: string | null;
  referencia_externa: string | null;
  tentativas: number;
  max_tentativas: number;
};

export async function listarMlSyncFalhasPendentes(limit = 50): Promise<MlSyncFalhaPendente[]> {
  const { data, error } = await supabaseAdmin.rpc("fn_ml_sync_falha_listar_pendentes", { p_limit: limit });
  if (error) {
    console.error("[listarMlSyncFalhasPendentes]", error.message);
    return [];
  }
  return (data ?? []) as MlSyncFalhaPendente[];
}

export async function marcarResultadoMlSyncFalha(id: string, sucesso: boolean, erro?: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("fn_ml_sync_falha_marcar_resultado", {
    p_id: id,
    p_sucesso: sucesso,
    p_erro: erro ? erro.slice(0, 2000) : null,
  });
  if (error) console.error("[marcarResultadoMlSyncFalha]", id, error.message);
}
