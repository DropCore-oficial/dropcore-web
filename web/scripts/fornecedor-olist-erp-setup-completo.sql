-- =============================================================================
-- DropCore — ERP fornecedor (Olist) + webhook de estoque — TUDO EM UM ARQUIVO
-- =============================================================================
-- Rode no Supabase SQL Editor (projeto DropCore-oficial).
--
-- Fluxo principal: webhook de estoque Olist → DropCore → sellers (push automático).
-- Sync automático: cron a cada 1 min (consulta API; sem webhook na Olist é a via principal) — ver seção 4.
--
-- Extensões: Database → Extensions → pg_cron, pg_net, supabase_vault (opcionais para outros crons).
-- =============================================================================

-- 1) Tabela integração Olist do fornecedor
CREATE TABLE IF NOT EXISTS public.fornecedor_olist_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL UNIQUE REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  olist_token_ciphertext text,
  olist_token_prefix text,
  olist_account_name text,
  olist_account_cnpj_normalized text,
  olist_ingest_token text,
  olist_token_validated_at timestamptz,
  olist_webhook_estoque_last_at timestamptz,
  olist_last_estoque_sync_at timestamptz,
  olist_last_estoque_sync_status text,
  olist_last_estoque_sync_error text,
  olist_last_estoque_sync_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_integrations_org_id
  ON public.fornecedor_olist_integrations(org_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fornecedor_olist_ingest_token
  ON public.fornecedor_olist_integrations(olist_ingest_token)
  WHERE olist_ingest_token IS NOT NULL AND length(trim(olist_ingest_token)) > 0;

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_cnpj_norm
  ON public.fornecedor_olist_integrations(olist_account_cnpj_normalized)
  WHERE olist_account_cnpj_normalized IS NOT NULL;

COMMENT ON TABLE public.fornecedor_olist_integrations IS
  'Token API Olist/Tiny por fornecedor — webhook estoque ERP → DropCore → sellers.';

-- Colunas extras se a tabela já existia
ALTER TABLE public.fornecedor_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_status text,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_error text,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_summary jsonb,
  ADD COLUMN IF NOT EXISTS olist_account_cnpj_normalized text,
  ADD COLUMN IF NOT EXISTS olist_ingest_token text,
  ADD COLUMN IF NOT EXISTS olist_webhook_estoque_last_at timestamptz;

-- 2) Log de webhooks de estoque
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

-- 3) Cron: estoque fornecedor — a cada 1 min UTC (principal sem webhook Olist)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'dropcore-fornecedor-olist-sync-estoque';

SELECT cron.schedule(
  'dropcore-fornecedor-olist-sync-estoque',
  '* * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/fornecedor-olist-sync-estoque');$$
);

-- 4) Conferência (opcional — descomente)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'fornecedor_olist_integrations';
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname LIKE '%fornecedor-olist%';
