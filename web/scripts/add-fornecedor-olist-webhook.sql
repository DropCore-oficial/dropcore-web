-- Webhook de estoque Olist → fornecedor DropCore (canal principal).
-- Rede de segurança: cron dropcore-fornecedor-olist-sync-estoque (15 min) — ver supabase-cron-jobs.sql.
-- Execute no Supabase SQL Editor após add-fornecedor-olist-integration.sql.

ALTER TABLE public.fornecedor_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_account_cnpj_normalized text,
  ADD COLUMN IF NOT EXISTS olist_ingest_token text,
  ADD COLUMN IF NOT EXISTS olist_webhook_estoque_last_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fornecedor_olist_ingest_token
  ON public.fornecedor_olist_integrations(olist_ingest_token)
  WHERE olist_ingest_token IS NOT NULL AND length(trim(olist_ingest_token)) > 0;

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_cnpj_norm
  ON public.fornecedor_olist_integrations(olist_account_cnpj_normalized)
  WHERE olist_account_cnpj_normalized IS NOT NULL;

COMMENT ON COLUMN public.fornecedor_olist_integrations.olist_ingest_token IS 'Token opaco na URL do webhook de estoque (?w=).';
COMMENT ON COLUMN public.fornecedor_olist_integrations.olist_webhook_estoque_last_at IS 'Último webhook de estoque recebido da Olist.';

CREATE TABLE IF NOT EXISTS public.fornecedor_olist_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  org_id uuid,
  olist_cnpj_normalized text,
  sku text,
  saldo numeric,
  payload jsonb,
  resultado text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_webhook_logs_created
  ON public.fornecedor_olist_webhook_logs(created_at DESC);

-- Mantém o cron de estoque (15 min) como rede de segurança — não desligar ao migrar para webhook.
