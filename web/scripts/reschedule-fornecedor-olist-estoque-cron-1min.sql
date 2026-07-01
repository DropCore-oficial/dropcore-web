-- Reagenda pull de estoque fornecedor Olist → DropCore: de 15 min para 1 min.
-- Rode no Supabase SQL Editor (produção). Não altera outros crons dropcore-*.

CREATE OR REPLACE FUNCTION public.dropcore_try_fornecedor_olist_estoque_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913002);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_fornecedor_olist_estoque_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913002);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_fornecedor_olist_estoque_sync_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_fornecedor_olist_estoque_sync_lock() TO postgres;

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'dropcore-fornecedor-olist-sync-estoque';

SELECT cron.schedule(
  'dropcore-fornecedor-olist-sync-estoque',
  '* * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/fornecedor-olist-sync-estoque');$$
);

-- Conferir:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'dropcore-fornecedor-olist-sync-estoque';
