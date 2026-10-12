-- Generalização de fn_pedido_cancelar_estorno (ML→Olist/Bling, 2026-10-12) passou a gravar
-- cancelado_motivo com 'olist_sem_sync'/'bling_sem_sync', mas a constraint original
-- (fix-fn-pedido-cancelar-estorno-ml-ambiguidade-e-motivo.sql) só permitia 'ml_sem_sync' —
-- cancelamento via Olist/Bling estourava CHECK e falhava silenciosamente dentro do
-- try/catch de pedidoCancelarEstorno.ts. Já aplicado em produção via MCP (2026-10-12).

ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_cancelado_motivo_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_cancelado_motivo_check
  CHECK (cancelado_motivo IS NULL OR cancelado_motivo IN ('ml_sem_sync', 'olist_sem_sync', 'bling_sem_sync'));
