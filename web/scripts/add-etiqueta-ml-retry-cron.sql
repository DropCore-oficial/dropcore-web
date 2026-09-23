-- Lock advisory pro cron de retry da etiqueta real de envio (Mercado Livre) — espelha o
-- retry da Olist (add-etiqueta-olist-retry-cron.sql, lock 913012). Próximo ID livre da
-- sequência usada em supabase-cron-jobs.sql / add-*-cron.sql: 913001, 913002, 913010,
-- 913011, 913012, 913014, 913015 já usados -> 913016.
CREATE OR REPLACE FUNCTION public.dropcore_try_etiqueta_ml_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913016);
$$;

CREATE OR REPLACE FUNCTION public.dropcore_release_etiqueta_ml_retry_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913016);
$$;

REVOKE ALL ON FUNCTION public.dropcore_try_etiqueta_ml_retry_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dropcore_release_etiqueta_ml_retry_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dropcore_try_etiqueta_ml_retry_lock() TO postgres;
GRANT EXECUTE ON FUNCTION public.dropcore_release_etiqueta_ml_retry_lock() TO postgres;

-- Retry dedicado: busca a etiqueta real de envio no Mercado Livre até conseguir (o
-- webhook só ingere o pedido novo, nunca a etiqueta — ver web/lib/etiquetaMlRetry.ts) --
-- a cada 15 min (UTC), mesma cadência do retry de etiqueta da Olist.
SELECT cron.schedule(
  'dropcore-etiqueta-ml-retry',
  '*/15 * * * *',
  $$SELECT public.dropcore_cron_http_post('/api/cron/etiqueta-ml-retry');$$
);
