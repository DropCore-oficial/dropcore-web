-- Lock advisory pro cron de retry de pedido `anuncio_sem_sku` (espelha os locks
-- Olist/Bling/ML em supabase-cron-jobs.sql etc — próximo ID numérico livre: 913018).
CREATE OR REPLACE FUNCTION public.dropcore_try_anuncio_sem_sku_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913018);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_anuncio_sem_sku_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913018);
$$;

GRANT EXECUTE ON FUNCTION public.dropcore_try_anuncio_sem_sku_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_anuncio_sem_sku_retry_lock() TO postgres;

-- Tenta promover pedido anuncio_sem_sku quando o seller cadastrar o SKU no anúncio, e
-- dispara alerta de urgência perto do prazo de despacho -- a cada 15 min (UTC).
SELECT cron.schedule(
  'dropcore-anuncio-sem-sku-retry',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/anuncio-sem-sku-retry');$$
);
