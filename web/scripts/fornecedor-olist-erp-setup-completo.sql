-- =============================================================================
-- DropCore — ERP fornecedor (Olist) + cron de estoque — TUDO EM UM ARQUIVO
-- =============================================================================
-- Rode no Supabase SQL Editor (projeto DropCore-oficial).
--
-- ANTES (só uma vez, se ainda não fez): crie o segredo do cron no Vault
-- com o MESMO valor de CRON_SECRET na Vercel (dropcore-web):
--
--   SELECT vault.create_secret(
--     'COLE_O_CRON_SECRET_DA_VERCEL',
--     'cron_secret',
--     'Bearer para /api/cron/* do DropCore'
--   );
--
-- Extensões: Database → Extensions → pg_cron, pg_net, supabase_vault (ativas).
-- =============================================================================

-- 1) Extensões
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) Tabela integração Olist do fornecedor
CREATE TABLE IF NOT EXISTS public.fornecedor_olist_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL UNIQUE REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  olist_token_ciphertext text,
  olist_token_prefix text,
  olist_account_name text,
  olist_token_validated_at timestamptz,
  olist_last_estoque_sync_at timestamptz,
  olist_last_estoque_sync_status text,
  olist_last_estoque_sync_error text,
  olist_last_estoque_sync_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_olist_integrations_org_id
  ON public.fornecedor_olist_integrations(org_id);

COMMENT ON TABLE public.fornecedor_olist_integrations IS
  'Token API Olist/Tiny por fornecedor — pull estoque ERP → DropCore → sellers.';

-- Colunas extras se a tabela já existia sem sync
ALTER TABLE public.fornecedor_olist_integrations
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_status text,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_error text,
  ADD COLUMN IF NOT EXISTS olist_last_estoque_sync_summary jsonb;

-- 3) Função HTTP para crons (necessária antes de cron.schedule)
DROP FUNCTION IF EXISTS public.dropcore_cron_http_post(text, int);
DROP FUNCTION IF EXISTS public.dropcore_cron_http_post(text);

CREATE OR REPLACE FUNCTION public.dropcore_cron_http_post(
  p_path text,
  p_timeout_ms int DEFAULT 300000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_base_url text := 'https://www.dropcore.com.br';
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RAISE EXCEPTION 'Vault: secret "cron_secret" ausente. Rode vault.create_secret (ver topo deste arquivo).';
  END IF;

  SELECT net.http_post(
    url := v_base_url || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_secret)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := GREATEST(p_timeout_ms, 5000)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dropcore_cron_http_post(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dropcore_cron_http_post(text, int) TO postgres;

COMMENT ON FUNCTION public.dropcore_cron_http_post IS
  'POST autenticado em /api/cron/* (produção) com CRON_SECRET do Vault.';

-- 4) Cron: estoque fornecedor Olist → DropCore → sellers (a cada 15 min UTC)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'dropcore-fornecedor-olist-sync-estoque';

SELECT cron.schedule(
  'dropcore-fornecedor-olist-sync-estoque',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/fornecedor-olist-sync-estoque');$$
);

-- 5) Conferência (opcional — descomente)
-- SELECT proname FROM pg_proc WHERE proname = 'dropcore_cron_http_post';
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'dropcore-fornecedor-olist-sync-estoque';
-- SELECT public.dropcore_cron_http_post('/api/cron/fornecedor-olist-sync-estoque');
