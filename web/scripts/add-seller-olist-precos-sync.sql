-- Sync de preços/custos Olist por seller (cron + manual).
-- Execute no Supabase SQL Editor após add-seller-olist-sync.sql.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_last_precos_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_precos_sync_status text,
  ADD COLUMN IF NOT EXISTS olist_last_precos_sync_error text,
  ADD COLUMN IF NOT EXISTS olist_last_precos_sync_summary jsonb;

COMMENT ON COLUMN public.seller_olist_integrations.olist_last_precos_sync_at IS 'Última sync de preços/custos DropCore → Olist do seller.';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_precos_sync_status IS 'ok | parcial | erro';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_precos_sync_summary IS 'Resumo JSON: grupos, grupos_ok, ok, falhas, ignorados_sem_custo.';
