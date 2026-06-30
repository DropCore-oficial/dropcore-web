-- Verificação de catálogo (SKUs DropCore vs Olist) por seller.
-- Execute no Supabase SQL Editor após add-seller-olist-integration.sql.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_last_catalogo_probe_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_catalogo_probe_summary jsonb;

COMMENT ON COLUMN public.seller_olist_integrations.olist_last_catalogo_probe_at IS 'Última verificação manual/automática de SKUs na Olist do seller.';
COMMENT ON COLUMN public.seller_olist_integrations.olist_last_catalogo_probe_summary IS 'Resumo JSON: total, encontrados, ausentes, amostra_ausentes, index_pais, index_codigos.';
