-- Lote 1 (pedidos): índices de FK faltando em financial_troca_pendente e
-- seller_ml_devolucoes_detectadas + correção de RLS initplan em
-- financial_troca_pendente. Achados via Supabase Advisor (performance) em
-- 2026-11-15. Tabelas pequenas hoje — CREATE INDEX simples (sem CONCURRENTLY,
-- que não roda dentro de transação/migration) é seguro, sem janela de lock
-- perceptível.

-- financial_troca_pendente: 4 FKs sem índice de cobertura
CREATE INDEX IF NOT EXISTS idx_financial_troca_pendente_org_id
  ON public.financial_troca_pendente (org_id);
CREATE INDEX IF NOT EXISTS idx_financial_troca_pendente_pedido_original_id
  ON public.financial_troca_pendente (pedido_original_id);
CREATE INDEX IF NOT EXISTS idx_financial_troca_pendente_pedido_reposicao_id
  ON public.financial_troca_pendente (pedido_reposicao_id);
CREATE INDEX IF NOT EXISTS idx_financial_troca_pendente_seller_id
  ON public.financial_troca_pendente (seller_id);

-- seller_ml_devolucoes_detectadas: 3 FKs sem índice de cobertura
CREATE INDEX IF NOT EXISTS idx_seller_ml_devolucoes_detectadas_fornecedor_id
  ON public.seller_ml_devolucoes_detectadas (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_seller_ml_devolucoes_detectadas_ledger_id
  ON public.seller_ml_devolucoes_detectadas (ledger_id);
CREATE INDEX IF NOT EXISTS idx_seller_ml_devolucoes_detectadas_pedido_id
  ON public.seller_ml_devolucoes_detectadas (pedido_id);

-- financial_troca_pendente: policy reavaliava auth.role() por linha
DROP POLICY IF EXISTS service_role_only ON public.financial_troca_pendente;
CREATE POLICY service_role_only ON public.financial_troca_pendente
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');
