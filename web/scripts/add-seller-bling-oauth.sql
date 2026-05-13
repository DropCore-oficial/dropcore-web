-- OAuth Bling por seller (tokens após callback /seller/integracoes-erp)
-- Execute no Supabase SQL Editor após add-seller-bling.sql.

ALTER TABLE public.seller_bling_integrations
  ALTER COLUMN bling_company_id DROP NOT NULL;

ALTER TABLE public.seller_bling_integrations
  ADD COLUMN IF NOT EXISTS bling_access_token text,
  ADD COLUMN IF NOT EXISTS bling_refresh_token text,
  ADD COLUMN IF NOT EXISTS bling_access_token_expires_at timestamptz;
