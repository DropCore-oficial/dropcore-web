-- Cron novo: pull de estoque Mercado Livre (fornecedor) → DropCore. A cada 5 min (piloto —
-- aperta pra 1 min, igual a Olist, depois de validar estabilidade em produção). Rode no
-- Supabase SQL Editor (produção). Não altera outros crons dropcore-*.

CREATE OR REPLACE FUNCTION public.dropcore_try_fornecedor_mercadolivre_estoque_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913022);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_fornecedor_mercadolivre_estoque_sync_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913022);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_fornecedor_mercadolivre_estoque_sync_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_fornecedor_mercadolivre_estoque_sync_lock() TO postgres;

SELECT cron.schedule(
  'dropcore-fornecedor-mercadolivre-sync-estoque',
  '*/5 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/fornecedor-mercadolivre-sync-estoque');$$
);

-- Conferir:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'dropcore-fornecedor-mercadolivre-sync-estoque';
