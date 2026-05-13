-- Campos de sincronização de pedidos Olist/Tiny por seller.
-- Execute no Supabase SQL Editor após add-seller-olist-integration.sql.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_pedidos_sync_cursor_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_sync_status text,
  ADD COLUMN IF NOT EXISTS olist_last_sync_error text,
  ADD COLUMN IF NOT EXISTS olist_last_sync_summary jsonb;

COMMENT ON COLUMN public.seller_olist_integrations.olist_pedidos_sync_cursor_at IS 'Último dataAtualizacao processado na API Olist/Tiny (com overlap no worker).';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_sync_at IS 'Timestamp da última execução do worker de sync.';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_sync_status IS 'ok | parcial | erro';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_sync_summary IS 'Resumo JSON da última execução (contagens, ids, avisos).';
