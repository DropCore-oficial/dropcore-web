-- Token opaco por seller na URL do webhook (?w=...). Evita depender de OLIST_WEBHOOK_SECRET
-- compartilhado na URL (cada seller tem link próprio; vazamento afeta só essa conta).
-- Execute no Supabase SQL Editor após add-seller-olist-integration.sql / webhook CNPJ.

ALTER TABLE public.seller_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_ingest_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_olist_integrations_ingest_token
  ON public.seller_olist_integrations(olist_ingest_token)
  WHERE olist_ingest_token IS NOT NULL AND length(trim(olist_ingest_token)) > 0;

COMMENT ON COLUMN public.seller_olist_integrations.olist_ingest_token IS 'Token opaco na URL /api/webhooks/olist?w=...; validado junto com CNPJ do payload.';
